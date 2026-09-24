// Read-only. Total doc counts across official_routes/curated_routes (all cities) — used to
// sanity-check that a scoped delete/apply only moved the expected number of docs.
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
async function main() {
  const db = initFb();
  const official = await db.collection('official_routes').count().get();
  const curated = await db.collection('curated_routes').count().get();
  console.log('TOTAL official_routes:', official.data().count);
  console.log('TOTAL curated_routes:', curated.data().count);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
