import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('authorities').where('name', '==', 'זכרון יעקב').get();
  if (snap.empty) {
    console.log('No exact match — scanning all authorities with boundaryGeoJSON set...');
    const all = await db.collection('authorities').select('name', 'type', 'boundaryGeoJSON').get();
    for (const d of all.docs) {
      if (d.data().boundaryGeoJSON) console.log({ id: d.id, name: d.data().name, type: d.data().type });
    }
    return;
  }
  for (const d of snap.docs) {
    console.log({ id: d.id, name: d.data().name, type: d.data().type, hasBoundary: !!d.data().boundaryGeoJSON });
  }
}
main();
