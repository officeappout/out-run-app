import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('city_registrations').doc('sderot').get();
  console.log('city_registrations/sderot exists:', snap.exists);
  if (snap.exists) console.log(JSON.stringify(snap.data(), null, 2));

  // In case the key isn't exactly 'sderot', list all registrations
  const all = await db.collection('city_registrations').get();
  console.log('\nAll city_registrations keys:', all.docs.map((d) => d.id));
}
main();
