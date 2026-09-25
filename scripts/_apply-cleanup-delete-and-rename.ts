/**
 * WRITE script — approved 23.09.2026. Explicit ID allowlists, no re-derived
 * filters. Deletes 8 test/duplicate `parks` docs; renames (name field ONLY)
 * 2 `official_routes` docs. Does NOT touch W2BrOhXzngOSUOOsyNvx (David is
 * checking it in the field).
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const DELETE_PARK_IDS = [
  '8tR3mAev3vKhBJlA1NuN',
  'HTaybrnb5q7O7KgNBzb2',
  '0EUuwx4bN4pgEABGdCel',
  '3nUndVyPz7gB9nl2Uug2',
  'tjRLdwTsdBgRaQQyQIVl',
  'z7lucCTXIk23wHrYjD8z',
  'lyK5Qw10Br3viUsROTZS',
  'ahTKeHLdPtrbgqi3tbyM',
];

const RENAME_ROUTES: Array<{ id: string; newName: string }> = [
  { id: 'L3q3SY0UaCeJHdtHUOV7', newName: 'מסלול הכלניות' },
  { id: 'YVx4pgJjOOXR8j497pPF', newName: 'מסלול קלאסי שכונת הכרמים' },
];

async function main() {
  console.log('=== Deleting 8 parks ===');
  for (const id of DELETE_PARK_IDS) {
    const ref = db.collection('parks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${id} — already gone, skipped`); continue; }
    await ref.delete();
    console.log(`  ✓ deleted ${id} ("${snap.data()?.name}")`);
  }

  console.log('\n=== Renaming 2 official_routes (name field only) ===');
  for (const { id, newName } of RENAME_ROUTES) {
    const ref = db.collection('official_routes').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${id} — does not exist, skipped`); continue; }
    const oldName = snap.data()?.name;
    await ref.update({ name: newName });
    console.log(`  ✓ ${id}: "${oldName}" → "${newName}"`);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
