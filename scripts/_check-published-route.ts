import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
async function main() {
  const db = initFb();
  const PUBLISHED_ID = '3OEIRnWxDJkU8gh1p39J';
  const ARCHIVED_ID = '6shDNCtlTqSLfygsjC0b';
  for (const id of [PUBLISHED_ID, ARCHIVED_ID]) {
    const doc = await db.collection('official_routes').doc(id).get();
    const d: any = doc.data();
    console.log(`\n=== ${id} ===`);
    console.log(`name=${d.name} status=${d.status} published=${d.published} distance=${d.distance} activityType=${d.activityType}`);
    console.log(`source.externalId=${d.source?.externalId}`);
    console.log(`createdAt=${d.createdAt?.toDate?.()} updatedAt=${d.updatedAt?.toDate?.()}`);
  }
  const segs = await db.collection('street_segments').where('officialRouteId', '==', PUBLISHED_ID).get();
  console.log(`\n=== street_segments referencing ${PUBLISHED_ID} (טיילת חולדה גורביץ') ===`);
  console.log(`count: ${segs.size}`);
  const segsArchived = await db.collection('street_segments').where('officialRouteId', '==', ARCHIVED_ID).get();
  console.log(`\nstreet_segments referencing ${ARCHIVED_ID} (הקפת גן הזיכרון, archived): ${segsArchived.size}`);
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
