/**
 * scripts/_verify-launch-day-kalaniyot-doc.ts — URGENT, read-only.
 * David is live in Sderot, told me he's using L3q3SY0UaCeJHdtHUOV7, but the
 * real nearest-vertex resolution at his exact GPS point picked a DIFFERENT
 * route (manual-walking-1790065270070, "מסלול הכלניות בדיקה", 3m away).
 * Need both docs' full shape to tell him precisely what's going on.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const ids = ['L3q3SY0UaCeJHdtHUOV7', 'manual-walking-1790065270070', 'gis-running-1774861952685-12'];
  for (const id of ids) {
    const doc = await db.collection('official_routes').doc(id).get();
    if (!doc.exists) {
      console.log(`\n=== ${id} ===\nNOT FOUND in official_routes`);
      continue;
    }
    const d = doc.data() as any;
    console.log(`\n=== ${id} ===`);
    console.log(`name: ${JSON.stringify(d.name)}`);
    console.log(`published: ${d.published}`);
    console.log(`city: ${d.city}`);
    console.log(`authorityId: ${d.authorityId}`);
    console.log(`pathLength: ${Array.isArray(d.path) ? d.path.length : 'N/A'}`);
    console.log(`createdAt: ${d.createdAt?.toDate?.() ?? d.createdAt}`);
    console.log(`distance: ${d.distance}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
