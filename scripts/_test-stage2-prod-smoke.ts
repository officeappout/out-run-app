// Stage 2 PROD smoke test — creates a real city_mapping_discovery_runs doc
// and waits for the REAL deployed Cloud Functions (onCityMappingDiscoveryRunCreated
// -> Cloud Tasks -> onCityMappingDiscoveryDispatch) to process it end to end.
// Unlike the earlier local tests, this script never imports/calls
// processDiscoveryRun itself — it only reads/writes Firestore and watches,
// so every transition observed here is the real production trigger chain.
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  const db = initFb();

  const routesBefore = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;
  console.log(`official_routes count for הרצליה BEFORE: ${routesBefore}`);

  const col = db.collection('city_mapping_discovery_runs');
  const createT0 = Date.now();
  const ref = await col.add({
    regionKey: 'herzliya',
    apply: false,
    requestedByUid: 'stage2-prod-smoke-test',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`created PROD smoke-test run doc: ${ref.id}`);
  console.log('waiting for the REAL deployed onCityMappingDiscoveryRunCreated trigger to fire...\n');

  const seenStatuses: string[] = [];
  const timestamps: Record<string, number> = {};

  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 35 * 60 * 1000; // 35min hard ceiling: 1800s dispatch budget + trigger/queue latency slack
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`TIMEOUT after ${((Date.now() - createT0) / 1000).toFixed(1)}s — run never resolved to succeeded/failed. Seen statuses: ${seenStatuses.join(' -> ')}`));
    }, timeoutMs);

    const unsubscribe = ref.onSnapshot(
      (snap) => {
        const data = snap.data();
        if (!data) return;
        const status = data.status as string;
        if (!seenStatuses.includes(status)) {
          seenStatuses.push(status);
          timestamps[status] = Date.now() - createT0;
          console.log(`[+${(timestamps[status] / 1000).toFixed(1)}s] status -> ${status}`);
        }
        if (status === 'succeeded' || status === 'failed') {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      },
      (err) => { clearTimeout(timeout); reject(err); },
    );
  });

  const finalSnap = await ref.get();
  const final = finalSnap.data()!;
  console.log('\n=== FINAL DOC STATE ===');
  console.log(JSON.stringify(final, null, 2));

  const routesAfter = (await db.collection('official_routes').where('city', '==', 'הרצליה').count().get()).data().count;
  console.log(`\nofficial_routes count for הרצליה AFTER: ${routesAfter}`);

  await ref.delete();
  console.log(`deleted PROD smoke-test run doc ${ref.id} (cleanup).`);

  console.log('\n=== TIMING SUMMARY (wall-clock from doc creation) ===');
  for (const s of seenStatuses) console.log(`  ${s}: +${(timestamps[s] / 1000).toFixed(1)}s`);

  if (final.status !== 'succeeded') {
    throw new Error(`PROD SMOKE TEST FAILED — final status '${final.status}', errorMessage=${final.errorMessage}`);
  }
  if (routesAfter !== routesBefore) {
    throw new Error(`ZERO-WRITES CHECK FAILED — official_routes count changed ${routesBefore} -> ${routesAfter} on an apply:false run`);
  }

  console.log('\n✅ PROD SMOKE TEST PASSED — end-to-end via the real deployed Cloud Functions, zero writes, within budget.');
  console.log(`\nSUMMARY: keptCount=${final.keptCount} droppedCount=${final.droppedCount} total_wall_clock=${((Date.now() - createT0) / 1000).toFixed(1)}s`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
