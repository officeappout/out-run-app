/**
 * scripts/_investigate-hiit-friendly-vs-core-level-overlap.ts
 *
 * READ-ONLY follow-up: _investigate-core-tabata-station-variety-and-level.ts
 * found ZERO exercises satisfying (hiit_friendly ∧ hasExplicitCoreLevel) in
 * real Firestore data — this script diagnoses WHY (are the two tag sets
 * simply disjoint today, or is one of them empty/near-empty overall).
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

function hasExplicitCoreLevel(d: any): boolean {
  return (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).some(
    (tp: any) => (tp?.programId === 'core' || String(tp?.programId ?? '').toLowerCase() === 'core')
      && typeof tp?.level === 'number' && tp.level > 0,
  );
}

async function main() {
  const snap = await db.collection('exercises').get();
  const all = snap.docs.map((doc) => ({ id: doc.id, d: doc.data() as any }));
  const hiit = all.filter(({ d }) => (d.tags ?? []).includes('hiit_friendly'));
  const coreLv = all.filter(({ d }) => hasExplicitCoreLevel(d));
  console.log(`total exercises: ${all.length}`);
  console.log(`hiit_friendly tagged: ${hiit.length}`);
  console.log(`hasExplicitCoreLevel: ${coreLv.length}`);

  console.log(`\n-- sample of hiit_friendly (first 12) --`);
  for (const { id, d } of hiit.slice(0, 12)) {
    console.log(`  ${he(d.name).padEnd(28)} targetPrograms=${JSON.stringify(d.targetPrograms ?? null)} (${id})`);
  }
  console.log(`\n-- sample of hasExplicitCoreLevel (first 12) --`);
  for (const { id, d } of coreLv.slice(0, 12)) {
    console.log(`  ${he(d.name).padEnd(28)} tags=${JSON.stringify(d.tags ?? [])} targetPrograms=${JSON.stringify(d.targetPrograms)} (${id})`);
  }

  const coreLvButNotHiit = coreLv.filter(({ d }) => !(d.tags ?? []).includes('hiit_friendly'));
  console.log(`\nhasExplicitCoreLevel but NOT hiit_friendly: ${coreLvButNotHiit.length} of ${coreLv.length}`);
  console.log(`-- sample (first 10) --`);
  for (const { id, d } of coreLvButNotHiit.slice(0, 10)) {
    console.log(`  ${he(d.name).padEnd(28)} tags=${JSON.stringify(d.tags ?? [])} (${id})`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
