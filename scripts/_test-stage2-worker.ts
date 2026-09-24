// Stage 2 verification — direct invocation of processDiscoveryRun (the
// worker's testable core, functions/src/geoDiscoveryWorker.ts), since this
// repo has no working Functions-emulator setup for a real trigger chain
// (confirmed: firebase.json has no functions emulator entry). Runs against
// REAL project Firestore (needed for authorities/official_routes
// resolution the Firestore emulator doesn't have seeded) — apply:false
// throughout, so runGeoDiscovery never writes to official_routes; the only
// write anywhere is to the one throwaway city_mapping_discovery_runs test
// doc created and deleted by this script itself.
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  // Credentialed init MUST happen before geoDiscoveryWorker.ts is ever
  // imported: that module does its own `if (!admin.apps.length)
  // admin.initializeApp()` (no args) at module load time — correct for the
  // real deployed Cloud Function, where Google's runtime auto-injects
  // credentials, but a static `import` at this file's top would evaluate
  // BEFORE initFb() below ever runs (ES import hoisting), so its no-args
  // init would win the admin.apps.length race and leave an uncredentialed
  // default app for the rest of this script. A dynamic import here, after
  // initFb() has already run, makes geoDiscoveryWorker.ts's own init a
  // correct no-op that reuses the credentialed app instead.
  const db = initFb();
  const { processDiscoveryRun, CITY_MAPPING_DISCOVERY_RUNS_COLLECTION } = await import('../functions/src/geoDiscoveryWorker');
  const col = db.collection(CITY_MAPPING_DISCOVERY_RUNS_COLLECTION);

  const ref = await col.add({
    regionKey: 'herzliya',
    apply: false,
    requestedByUid: 'stage2-direct-invocation-test',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`created test run doc: ${ref.id}`);

  console.log('\n=== CALL 1 — processDiscoveryRun on a pending doc ===');
  const t0 = Date.now();
  await processDiscoveryRun(ref.id, db);
  const elapsedMs = Date.now() - t0;

  const after = (await ref.get()).data();
  console.log('\n=== doc state after CALL 1 ===');
  console.log(JSON.stringify(after, null, 2));
  console.log(`elapsed: ${(elapsedMs / 1000).toFixed(1)}s (${elapsedMs}ms)`);

  if (after?.status !== 'succeeded') throw new Error(`expected status 'succeeded', got '${after?.status}'`);
  if (typeof after?.keptCount !== 'number' || typeof after?.droppedCount !== 'number') {
    throw new Error('missing keptCount/droppedCount on the result doc');
  }

  console.log('\n=== CALL 2 — processDiscoveryRun again on the now-succeeded doc (idempotency check) ===');
  const beforeSecondCall = (await ref.get()).data();
  const t1 = Date.now();
  await processDiscoveryRun(ref.id, db);
  const secondCallElapsedMs = Date.now() - t1;
  const afterSecondCall = (await ref.get()).data();

  console.log(`2nd call elapsed: ${secondCallElapsedMs}ms`);
  if (JSON.stringify(beforeSecondCall) !== JSON.stringify(afterSecondCall)) {
    throw new Error('IDEMPOTENCY FAILED — doc changed on a second call to an already-succeeded run');
  }
  console.log('idempotency OK — doc unchanged, no re-processing on an already-succeeded run.');

  await ref.delete();
  console.log(`\ndeleted test run doc ${ref.id} (cleanup).`);

  console.log('\n=== CALL 3 — non-superAdmin requestedByUid with apply:true → must reject, zero writes ===');
  const routesBefore = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;

  const unauthorizedRef = await col.add({
    regionKey: 'herzliya',
    apply: true,
    requestedByUid: 'stage2-test-non-superadmin-uid', // deliberately a nonexistent uid — fails both the Admin Auth email lookup and the Firestore users/{uid}.core check, exactly like a real non-superAdmin would
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`created unauthorized-apply test run doc: ${unauthorizedRef.id}`);

  const t2 = Date.now();
  await processDiscoveryRun(unauthorizedRef.id, db);
  const thirdCallElapsedMs = Date.now() - t2;

  const afterUnauthorized = (await unauthorizedRef.get()).data();
  console.log(JSON.stringify(afterUnauthorized, null, 2));
  console.log(`elapsed: ${thirdCallElapsedMs}ms (should be near-instant — rejected before runGeoDiscovery/Overpass, unlike CALL 1's ${elapsedMs}ms)`);

  if (afterUnauthorized?.status !== 'failed') {
    throw new Error(`expected status 'failed' for an unauthorized apply:true run, got '${afterUnauthorized?.status}'`);
  }
  if (afterUnauthorized?.errorMessage !== 'requester not authorized for apply run') {
    throw new Error(`unexpected errorMessage: '${afterUnauthorized?.errorMessage}'`);
  }

  const routesAfter = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;
  console.log(`official_routes count for הרצליה: before=${routesBefore} after=${routesAfter}`);
  if (routesAfter !== routesBefore) {
    throw new Error(`ZERO-WRITES CHECK FAILED — official_routes count changed (${routesBefore} -> ${routesAfter}) on a rejected apply:true run`);
  }
  console.log('zero-writes check OK — official_routes count unchanged; the discovery run never executed.');

  await unauthorizedRef.delete();
  console.log(`deleted unauthorized-apply test run doc ${unauthorizedRef.id} (cleanup).`);

  console.log('\n✅ ALL STAGE 2 WORKER TESTS PASSED');
  console.log(`\nSUMMARY: keptCount=${after.keptCount} droppedCount=${after.droppedCount} runtime=${(elapsedMs / 1000).toFixed(1)}s`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
