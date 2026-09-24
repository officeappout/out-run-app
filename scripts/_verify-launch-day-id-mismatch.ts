import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('official_routes').limit(200).get();
  const target = snap.docs.find((d) => d.id.includes('1790065270070'));
  if (!target) {
    console.log('No doc with that id substring found in the scan at all — mystery.');
    return;
  }
  console.log(`Found via scan. Raw id: "${target.id}" (length ${target.id.length})`);
  console.log(`Char codes: ${Array.from(target.id).map((c) => c.charCodeAt(0)).join(',')}`);
  console.log(`ref.path: ${target.ref.path}`);
  const direct = await db.doc(target.ref.path).get();
  console.log(`Direct get via ref.path exists? ${direct.exists}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
