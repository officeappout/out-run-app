/**
 * READ-ONLY, PRODUCTION. No writes. Prints ONLY field names and presence
 * counts — never field values, never document content (David, explicit:
 * "בלי להדפיס תוכן").
 *
 * Full inventory of every distinct top-level field name that appears on
 * real workouts/{docId} documents, across the whole collection (734 docs
 * — small enough to scan completely, not just sample). This is the
 * authoritative source for fixing GET /api/units/member-workouts's field
 * names, and for confirming no geographic field slips into whatever new
 * .select() projection replaces the old one.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('workouts').get();
  console.log('total docs scanned:', snap.size);

  const fieldCounts = new Map<string, number>();
  const fieldTypes = new Map<string, Set<string>>();

  snap.docs.forEach((d) => {
    const data = d.data();
    Object.keys(data).forEach((k) => {
      fieldCounts.set(k, (fieldCounts.get(k) ?? 0) + 1);
      const v = data[k];
      let t: string = typeof v;
      if (v && typeof v.toDate === 'function') t = 'Timestamp';
      else if (Array.isArray(v)) t = `array[${v.length > 0 ? typeof v[0] : 'empty'}]`;
      if (!fieldTypes.has(k)) fieldTypes.set(k, new Set());
      fieldTypes.get(k)!.add(t);
    });
  });

  const sorted = Array.from(fieldCounts.entries()).sort((a, b) => b[1] - a[1]);
  console.log('\n=== every distinct field name, presence count, and value TYPE (never value) ===');
  sorted.forEach(([field, count]) => {
    const types = Array.from(fieldTypes.get(field) ?? []).join('|');
    console.log(`  ${field}: ${count}/${snap.size} (${(100 * count / snap.size).toFixed(0)}%) — type: ${types}`);
  });
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
