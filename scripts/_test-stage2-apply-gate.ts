// Fast, isolated check for the new in-worker apply-authorization gate
// (functions/src/geoDiscoveryWorker.ts's isAuthorizedForApply) — split out
// from _test-stage2-worker.ts's CALL 3 so re-verifying this specific path
// doesn't re-pay the ~15-20min real Herzliya discovery cost CALL 1 there
// incurs. Same real-Firestore, apply:false-elsewhere approach.
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  const db = initFb();
  const { processDiscoveryRun } = await import('../functions/src/geoDiscoveryWorker');
  const col = db.collection('city_mapping_discovery_runs');

  const routesBefore = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;

  const ref = await col.add({
    regionKey: 'herzliya',
    apply: true,
    requestedByUid: 'stage2-test-non-superadmin-uid',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`created unauthorized-apply test run doc: ${ref.id}`);

  const t0 = Date.now();
  await processDiscoveryRun(ref.id, db);
  const elapsedMs = Date.now() - t0;

  const after = (await ref.get()).data();
  console.log(JSON.stringify(after, null, 2));
  console.log(`elapsed: ${elapsedMs}ms`);

  if (after?.status !== 'failed') throw new Error(`expected status 'failed', got '${after?.status}'`);
  if (after?.errorMessage !== 'requester not authorized for apply run') {
    throw new Error(`unexpected errorMessage: '${after?.errorMessage}'`);
  }

  const routesAfter = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;
  console.log(`official_routes count for הרצליה: before=${routesBefore} after=${routesAfter}`);
  if (routesAfter !== routesBefore) {
    throw new Error(`ZERO-WRITES CHECK FAILED — count changed (${routesBefore} -> ${routesAfter})`);
  }

  await ref.delete();
  console.log(`deleted test run doc ${ref.id} (cleanup).`);
  console.log('\n✅ APPLY-GATE TEST PASSED — unauthorized apply:true run ended failed, zero writes, no Overpass call made.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
