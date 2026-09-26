/**
 * READ-ONLY, PRODUCTION. Inspects the raw field shape of a few real
 * streaks/{uid} and workouts/{docId} docs to find why the cross-reference
 * audit found zero matches for every sampled user — almost certainly a
 * field-name assumption bug in that script, not a real data problem.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  console.log('=== streaks/{uid} — 3 raw docs ===');
  const streaksSnap = await db.collection('streaks').limit(3).get();
  streaksSnap.docs.forEach((d) => {
    console.log('docId:', d.id);
    console.log(JSON.stringify(d.data(), null, 2));
    console.log('---');
  });

  console.log('\n=== workouts/{docId} — 3 raw docs ===');
  const workoutsSnap = await db.collection('workouts').limit(3).get();
  workoutsSnap.docs.forEach((d) => {
    console.log('docId:', d.id);
    console.log(JSON.stringify(d.data(), null, 2));
    console.log('---');
  });
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
