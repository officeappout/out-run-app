/**
 * ONE-OFF, read-only. Full population check: every exercise with
 * movementGroup==='core' (or anti_extension/anti_rotation), does it have a
 * real targetPrograms[core] entry? Corrected to match BOTH the literal
 * 'core' slug and the real Firestore hash id (kDMpobbKsuVTByTIKUpe) — the
 * first pass of this script wrongly checked only the literal string and
 * produced a false "0/56" result. No writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const CORE_PROGRAM_IDS = new Set(['core', 'kDMpobbKsuVTByTIKUpe']);

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('exercises').get();
  const coreMgExercises: any[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (['core', 'anti_extension', 'anti_rotation'].includes(d.movementGroup)) {
      const coreTp = (d.targetPrograms ?? []).find((t: any) => CORE_PROGRAM_IDS.has(t.programId));
      coreMgExercises.push({
        id: doc.id,
        name: d.name?.he ?? d.name,
        hasCoreLevel: !!(coreTp && typeof coreTp.level === 'number' && coreTp.level > 0),
        coreLevel: coreTp?.level ?? null,
        tags: d.tags ?? [],
      });
    }
  });
  const withLevel = coreMgExercises.filter((e) => e.hasCoreLevel);
  const withoutLevel = coreMgExercises.filter((e) => !e.hasCoreLevel);
  console.log(`Total movementGroup∈{core,anti_extension,anti_rotation}: ${coreMgExercises.length}`);
  console.log(`With a real targetPrograms[core] level: ${withLevel.length}`);
  console.log(`WITHOUT (hasExplicitCoreLevel=false): ${withoutLevel.length}`);
  console.log('\n--- WITHOUT a core level (name, hiit_friendly?) ---');
  withoutLevel.forEach((e) => console.log(`  ${e.name}  [${e.id}]  hiit_friendly=${e.tags.includes('hiit_friendly')}`));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
