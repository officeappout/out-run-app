import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('official_routes').limit(200).get();
  // Find by the REAL doc.id first — this is the ground truth.
  const kalaniyotDoc = snap.docs.find((d) => d.id === 'L3q3SY0UaCeJHdtHUOV7');
  if (kalaniyotDoc) {
    const data = kalaniyotDoc.data();
    console.log(`Real doc.id: "${kalaniyotDoc.id}"`);
    console.log(`data.id field (if any): ${JSON.stringify((data as any).id)}`);
    console.log(`data.name: ${JSON.stringify((data as any).name)}`);
  } else {
    console.log('L3q3SY0UaCeJHdtHUOV7 not in the scan by real doc.id');
  }
  // Also: does ANY doc have a data.id field matching the confusing value?
  const collision = snap.docs.find((d) => (d.data() as any).id === 'manual-walking-1790065270070');
  if (collision) {
    console.log(`\nFOUND data.id collision: real doc.id="${collision.id}", data.id field="${(collision.data() as any).id}"`);
    console.log(`data.name: ${JSON.stringify((collision.data() as any).name)}`);
  } else {
    console.log('\nNo doc has data.id === "manual-walking-1790065270070"');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
