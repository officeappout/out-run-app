/**
 * ONE-OFF, read-only. Counts exercises tagged 'hiit_friendly' AND how many of
 * those pass hasExplicitCoreLevel (real targetPrograms[core] entry) — the
 * exact composition of corePool (WorkoutGenerator.ts:1157) before it's handed
 * to buildCoreTabataBlock. No writes. Delete after the investigation.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

function hasExplicitCoreLevel(tp: any[] | undefined): boolean {
  return (tp ?? []).some((t) => (t.programId === 'core' || t.programId === 'kDMpobbKsuVTByTIKUpe') && typeof t.level === 'number' && t.level > 0);
}

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('exercises').get();
  let hiitFriendly = 0;
  let hiitFriendlyAndCore: any[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.tags?.includes('hiit_friendly')) {
      hiitFriendly++;
      if (hasExplicitCoreLevel(d.targetPrograms)) {
        hiitFriendlyAndCore.push({ id: doc.id, name: d.name?.he ?? d.name, targetPrograms: d.targetPrograms });
      }
    }
  });
  console.log(`Total exercises: ${snap.size}`);
  console.log(`Tagged 'hiit_friendly': ${hiitFriendly}`);
  console.log(`Of those, pass hasExplicitCoreLevel (real corePool candidates): ${hiitFriendlyAndCore.length}`);
  console.log(JSON.stringify(hiitFriendlyAndCore, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
