/**
 * READ-ONLY — pulls name/city/published for the final delete + rename
 * candidate lists, for a last review before any write. Writes nothing.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const DELETE_PARKS = [
  '8tR3mAev3vKhBJlA1NuN',
  'HTaybrnb5q7O7KgNBzb2',
  '0EUuwx4bN4pgEABGdCel',
  '3nUndVyPz7gB9nl2Uug2',
  'tjRLdwTsdBgRaQQyQIVl',
  'z7lucCTXIk23wHrYjD8z',
  'lyK5Qw10Br3viUsROTZS',
  'ahTKeHLdPtrbgqi3tbyM',
];

const RENAME_ROUTES = ['L3q3SY0UaCeJHdtHUOV7', 'YVx4pgJjOOXR8j497pPF'];
const RENAME_PARKS_PENDING_DECISION = ['W2BrOhXzngOSUOOsyNvx'];

async function main() {
  console.log('=== DELETE candidates (parks collection) ===');
  for (const id of DELETE_PARKS) {
    const snap = await db.collection('parks').doc(id).get();
    const d = snap.data();
    console.log({ id, name: d?.name, city: d?.city || null, authorityId: d?.authorityId || null, published: d?.published ?? null });
  }

  console.log('\n=== RENAME-only candidates (official_routes) ===');
  for (const id of RENAME_ROUTES) {
    const snap = await db.collection('official_routes').doc(id).get();
    const d = snap.data();
    console.log({ id, name: d?.name, city: d?.city || null, authorityId: d?.authorityId || null });
  }

  console.log('\n=== RENAME candidate pending duplicate decision (parks) ===');
  for (const id of RENAME_PARKS_PENDING_DECISION) {
    const snap = await db.collection('parks').doc(id).get();
    const d = snap.data();
    console.log({ id, name: d?.name, city: d?.city || null, authorityId: d?.authorityId || null, published: d?.published ?? null });
  }
}
main();
