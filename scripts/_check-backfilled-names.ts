import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const IDS = [
  '2t5az38z4tbMFJOSVBpp',
  'rFxXF6Kf4AG260S3GX8F',
  'R8jeVvPkLybCQUltPJN6',
  '250ImS07Mp2XN8ZzapNb',
  '8tR3mAev3vKhBJlA1NuN',
  'AgmHEDDXiHoAx6YUMaqX',
  'HTaybrnb5q7O7KgNBzb2',
];

async function main() {
  for (const id of IDS) {
    const snap = await db.collection('parks').doc(id).get();
    const d = snap.data();
    console.log(id, '::', d?.name || '(empty)');
  }
}
main();
