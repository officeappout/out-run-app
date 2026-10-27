/**
 * READ-ONLY. English coverage of LocalizedText content ({he, en}) per collection.
 * Only collection .get() reads; no set/update/delete/batch/transaction. Prints counts, no content.
 *
 * Run: FIREBASE_SERVICE_ACCOUNT_KEY='...' npx tsx scripts/_count-content-en-coverage.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

type Field = { he: string; en: string };
type Obj = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
function field(v: unknown, out: Field[]) {
  if (!v || typeof v !== 'object') return;
  const o = v as Obj;
  if (str(o.he)) out.push({ he: str(o.he), en: str(o.en) });
}
function list(v: unknown, out: Field[]) {
  if (Array.isArray(v)) v.forEach((x) => field(x, out));
}

function exerciseFields(d: Obj): Field[] {
  const out: Field[] = [];
  const c = (d.content ?? {}) as Obj;
  field(d.name, out);
  field(c.description, out);
  field(c.instructions, out);
  list(c.specificCues, out);
  list(c.highlights, out);
  const methods = (d.execution_methods ?? d.executionMethods ?? []) as Obj[];
  for (const m of Array.isArray(methods) ? methods : []) {
    field(m.methodName, out);
    field(m.notificationText, out);
    list(m.specificCues, out);
    list(m.highlights, out);
  }
  return out;
}

function gearFields(d: Obj): Field[] {
  const out: Field[] = [];
  field(d.name, out);
  field(d.description, out);
  return out;
}

const COLLECTIONS: Array<{ name: string; fields: (d: Obj) => Field[] }> = [
  { name: 'exercises', fields: exerciseFields },
  { name: 'gear_definitions', fields: gearFields },
];

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

async function main() {
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col.name).get();
    let withText = 0, full = 0, partial = 0, none = 0, fieldsTotal = 0, fieldsMissing = 0, heWords = 0;
    for (const doc of snap.docs) {
      const fs = col.fields(doc.data() as Obj);
      if (!fs.length) continue;
      withText++;
      const missing = fs.filter((f) => !f.en);
      fieldsTotal += fs.length;
      fieldsMissing += missing.length;
      heWords += missing.reduce((n, f) => n + words(f.he), 0);
      if (missing.length === 0) full++;
      else if (missing.length === fs.length) none++;
      else partial++;
    }
    console.log(JSON.stringify({ collection: col.name, totalDocs: snap.size, docsWithText: withText, fullEn: full, partialEn: partial, noEn: none, fields: fieldsTotal, fieldsMissingEn: fieldsMissing, hebrewWordsToTranslate: heWords }));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
