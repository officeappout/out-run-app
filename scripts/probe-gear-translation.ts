/**
 * scripts/probe-gear-translation.ts — READ ONLY, throwaway (do not commit).
 *
 * Lists gym_equipment docs whose normalizeGearId result does NOT match any gear
 * id the EXERCISES reference → those items translate to nothing usable and get
 * filtered out of a station. Prints name + current normalization so we can add
 * the right alias (Hebrew name → canonical).
 *
 * Usage: npx tsx scripts/probe-gear-translation.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const [gymSnap, exSnap] = await Promise.all([
    db.collection('gym_equipment').get(),
    db.collection('exercises').get(),
  ]);
  const gymEquip = gymSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const exercises = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const { seedEquipmentCaches, normalizeGearId } = await import(
    '../src/features/workout-engine/shared/utils/gear-mapping.utils'
  );
  seedEquipmentCaches([], gymEquip as any);

  // Exercise vocabulary: distinct normalized gear ids referenced by execution methods.
  const vocab = new Map<string, number>();
  for (const ex of exercises) {
    const methods = (ex as any).execution_methods || (ex as any).executionMethods || [];
    for (const m of methods) {
      const ids = [...(m.equipmentIds || []), ...(m.gearIds || []), m.equipmentId, m.gearId].filter(Boolean);
      for (const id of ids) {
        const n = normalizeGearId(String(id));
        vocab.set(n, (vocab.get(n) || 0) + 1);
      }
    }
  }
  const inVocab = (n: string) => vocab.has(n);

  const rows = (gymEquip as any[]).map((g) => ({
    id: g.id, name: g.name ?? '?', iconKey: g.iconKey ?? '-', norm: normalizeGearId(g.id),
  }));
  const bad = rows.filter((r) => !inVocab(r.norm));

  console.log('\n── EXERCISE VOCAB (normalized gear id : #methods) ──');
  console.log(Array.from(vocab.entries()).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}(${c})`).join('  '));

  console.log(`\n── GYM docs NOT matching exercise vocab (${bad.length}/${rows.length}) ──`);
  for (const r of bad) console.log(`  "${r.name}"  icon=${r.iconKey}  norm=${r.norm}`);

  console.log('\n── GYM docs that DO match (for reference) ──');
  for (const r of rows.filter((r) => inVocab(r.norm))) console.log(`  "${r.name}" → ${r.norm}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
