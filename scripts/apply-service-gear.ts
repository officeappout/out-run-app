/**
 * apply-service-gear.ts — write the reviewer-filled `service_gear_final` gear onto the SERVICE
 * execution-method of each exercise. Reads scripts/corpus/service-gear-review.csv.
 *
 * Resolution (name → id):
 *   1) PRIMARY — how existing park/home methods actually store that gear name (so the service
 *      method reuses the EXACT same gear id + array as park/home). Built by scanning all methods.
 *   2) FALLBACK — a direct lookup in gear_definitions (name.he) / gym_equipment (name).
 *   gear_definitions matches → method.gearIds[] ; gym_equipment matches → method.equipmentIds[].
 *
 * Write scope: ONLY the method with location=service (or locationMapping includes 'service').
 *   Additive (arrayUnion-style) — never touches park/home methods. Rows with an empty
 *   service_gear_final are skipped (bodyweight, left as-is). Refuses to write if any name is
 *   unresolved.
 *
 * Usage:
 *   npx tsx scripts/apply-service-gear.ts            # DRY-RUN (default) — resolve + report, NO writes
 *   npx tsx scripts/apply-service-gear.ts --apply    # actually write
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });

const isServiceMethod = (m: any) =>
  m?.location === 'service' || (m?.locationMapping || []).includes('service');

type Resolved = { id: string; kind: 'gear' | 'equip'; source: 'usage' | 'collection' };

(async () => {
  const db = admin.firestore();

  // id → name maps (same shape the export used).
  const gearMap = new Map<string, string>(); // gear_definitions
  (await db.collection('gear_definitions').get()).forEach((d) => {
    const n = (d.data() as any).name;
    const name = (n?.he || n?.en || '').trim();
    if (name) gearMap.set(d.id, name);
  });
  const equipMap = new Map<string, string>(); // gym_equipment
  (await db.collection('gym_equipment').get()).forEach((d) => {
    const n = (d.data() as any).name;
    const name = (typeof n === 'string' ? n : n?.he || n?.en || '').trim();
    if (name) equipMap.set(d.id, name);
  });

  // Reverse collection maps (fallback resolver).
  const gearDefByName = new Map<string, string>();
  for (const [id, name] of gearMap) if (!gearDefByName.has(name)) gearDefByName.set(name, id);
  const equipByName = new Map<string, string>();
  for (const [id, name] of equipMap) if (!equipByName.has(name)) equipByName.set(name, id);

  // PRIMARY resolver: name → {id, kind} as ACTUALLY used by existing methods (any location),
  // so the service gear reuses the same records park/home use.
  const usageByName = new Map<string, { id: string; kind: 'gear' | 'equip' }>();
  const allExercises = await db.collection('exercises').get();
  for (const doc of allExercises.docs) {
    const methods = (doc.data() as any).execution_methods ?? [];
    for (const m of methods) {
      const addGear = (id: string) => {
        const nm = gearMap.get(id);
        if (nm && !usageByName.has(nm)) usageByName.set(nm, { id, kind: 'gear' });
      };
      const addEquip = (id: string) => {
        const nm = equipMap.get(id);
        if (nm && !usageByName.has(nm)) usageByName.set(nm, { id, kind: 'equip' });
      };
      (m?.gearIds || []).forEach(addGear);
      (m?.equipmentIds || []).forEach(addEquip);
      if (m?.gearId) addGear(m.gearId);
      if (m?.equipmentId) addEquip(m.equipmentId);
    }
  }

  const resolve = (name: string): Resolved | null => {
    const n = name.trim();
    const u = usageByName.get(n);
    if (u) return { ...u, source: 'usage' };
    if (gearDefByName.has(n)) return { id: gearDefByName.get(n)!, kind: 'gear', source: 'collection' };
    if (equipByName.has(n)) return { id: equipByName.get(n)!, kind: 'equip', source: 'collection' };
    return null;
  };

  // Parse the filled CSV.
  const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/corpus/service-gear-review.csv'), 'utf8');
  const rows = raw.split('\n').filter((l) => l.trim()).slice(1);
  const parse = (line: string) => line.replace(/^"|"$/g, '').split(/","/);

  const targets: { id: string; nameHe: string; names: string[] }[] = [];
  const nameSet = new Set<string>();
  for (const r of rows) {
    const f = parse(r);
    const sf = (f[5] || '').trim();
    if (!sf) continue; // empty = bodyweight, skip
    const names = sf.split(' | ').map((s) => s.trim()).filter(Boolean);
    names.forEach((nm) => nameSet.add(nm));
    targets.push({ id: f[0], nameHe: f[1], names });
  }

  // Resolution report.
  console.log(`\n=== NAME → ID resolution (${nameSet.size} unique) ===`);
  const unresolved: string[] = [];
  for (const nm of [...nameSet].sort()) {
    const res = resolve(nm);
    if (res) {
      const arr = res.kind === 'gear' ? 'gearIds' : 'equipmentIds';
      console.log(`  ✅ ${nm}  →  ${arr}  ${res.id}  (${res.source})`);
    } else {
      console.log(`  ❌ ${nm}  →  UNRESOLVED`);
      unresolved.push(nm);
    }
  }

  // Plan per exercise (read each doc, locate the service method).
  let toUpdate = 0, missingService = 0, docMissing = 0;
  const plan: { id: string; nameHe: string; idx: number; gearIds: string[]; equipmentIds: string[] }[] = [];
  for (const t of targets) {
    const snap = await db.collection('exercises').doc(t.id).get();
    const d = snap.data() as any;
    if (!d) { console.log(`  ⚠️ ${t.id} (${t.nameHe}) — exercise doc NOT FOUND`); docMissing++; continue; }
    const methods = d.execution_methods ?? [];
    const idx = methods.findIndex(isServiceMethod);
    if (idx < 0) { console.log(`  ⚠️ ${t.id} (${t.nameHe}) — NO service method`); missingService++; continue; }
    const gearIds: string[] = [], equipmentIds: string[] = [];
    for (const nm of t.names) {
      const res = resolve(nm);
      if (!res) continue;
      (res.kind === 'gear' ? gearIds : equipmentIds).push(res.id);
    }
    plan.push({ id: t.id, nameHe: t.nameHe, idx, gearIds, equipmentIds });
    toUpdate++;
  }

  console.log(`\n=== PLAN SUMMARY ===`);
  console.log(`  filled rows (exercises):     ${targets.length}`);
  console.log(`  service methods to update:   ${toUpdate}`);
  console.log(`  missing service method:      ${missingService}`);
  console.log(`  exercise doc not found:      ${docMissing}`);
  console.log(`  unresolved names:            ${unresolved.length}${unresolved.length ? ' → ' + unresolved.join(', ') : ''}`);

  if (!APPLY) {
    console.log(`\n(DRY-RUN — no writes. Every planned update:)`);
    plan.forEach((p) =>
      console.log(`  ${p.nameHe} (${p.id})  svc-method#${p.idx}  gearIds=[${p.gearIds.join(',')}]  equipmentIds=[${p.equipmentIds.join(',')}]`),
    );
    console.log(`\nRun with --apply to write.`);
    process.exit(0);
  }

  if (unresolved.length) {
    console.error(`\n❌ Refusing to write — ${unresolved.length} unresolved name(s). Fix them first.`);
    process.exit(1);
  }

  // WRITE — re-read each doc fresh, union gear onto ONLY the service method, updateDoc.
  let written = 0;
  for (const p of plan) {
    const ref = db.collection('exercises').doc(p.id);
    const snap = await ref.get();
    const d = snap.data() as any;
    const methods = [...(d.execution_methods ?? [])];
    const idx = methods.findIndex(isServiceMethod);
    if (idx < 0) { console.log(`  ⚠️ ${p.id} — service method vanished, skip`); continue; }
    const m = { ...methods[idx] };
    const newGear = [...new Set([...(m.gearIds || []), ...p.gearIds])];
    const newEquip = [...new Set([...(m.equipmentIds || []), ...p.equipmentIds])];
    if (newGear.length) m.gearIds = newGear;
    if (newEquip.length) m.equipmentIds = newEquip;
    methods[idx] = m;
    await ref.update({
      execution_methods: methods,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
    console.log(`  ✅ ${p.nameHe} (${p.id}) — gearIds=[${newGear.join(',')}] equipmentIds=[${newEquip.join(',')}]`);
  }
  console.log(`\nDONE — ${written} exercises updated.`);
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
