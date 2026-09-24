/**
 * READ-ONLY — full inspection of the 2 parks David held back from the
 * backfill (no createdAt/status). Writes nothing. Checks:
 *  - name, coordinates, facilityType, facilities/gymEquipment list
 *  - any user_contributions doc with approvedParkId matching either id
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const TARGET_IDS = ['ahTKeHLdPtrbgqi3tbyM', 'lyK5Qw10Br3viUsROTZS'];

async function main() {
  for (const id of TARGET_IDS) {
    const snap = await db.collection('parks').doc(id).get();
    if (!snap.exists) { console.log(`${id}: DOES NOT EXIST`); continue; }
    const d = snap.data()!;
    console.log(`\n=== park ${id} ===`);
    console.log({
      name: d.name || '(empty)',
      city: d.city || null,
      location: d.location || null,
      facilityType: d.facilityType || null,
      facilitiesCount: Array.isArray(d.facilities) ? d.facilities.length : 0,
      facilities: Array.isArray(d.facilities) ? d.facilities : [],
      gymEquipmentCount: Array.isArray(d.gymEquipment) ? d.gymEquipment.length : 0,
      featureTags: d.featureTags || [],
      description: d.description || '(empty)',
      externalSourceId: d.externalSourceId || null,
      origin: d.origin || null,
      createdByUser: d.createdByUser || null,
      allFieldKeys: Object.keys(d).sort(),
    });
  }

  console.log('\n=== matching user_contributions by approvedParkId ===');
  const contribSnap = await db
    .collection('user_contributions')
    .where('approvedParkId', 'in', TARGET_IDS)
    .get();
  if (contribSnap.empty) {
    console.log('No user_contributions doc found with approvedParkId matching either id.');
  } else {
    for (const doc of contribSnap.docs) {
      const d = doc.data();
      console.log({
        id: doc.id,
        approvedParkId: d.approvedParkId,
        type: d.type,
        status: d.status,
        createdAt: d.createdAt?.toDate?.() ?? d.createdAt ?? null,
        parkName: d.parkName || null,
      });
    }
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
