/**
 * READ-ONLY verification of the crossBrandFallback fix: for the pilot park's
 * (2t5az38z4tbMFJOSVBpp) real gymEquipment array, resolve exactly what
 * EquipmentCard would now render — brand's image (brandName=='' for every
 * contributed item + crossBrandFallback now effectively true → brands[0]
 * .imageUrl) vs the icon/glyph fallback it used to fall through to.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const parkSnap = await db.collection('parks').doc('2t5az38z4tbMFJOSVBpp').get();
  const gymEquipment: Array<{ equipmentId: string; brandName?: string }> = parkSnap.data()?.gymEquipment ?? [];
  console.log(`park has ${gymEquipment.length} gymEquipment entries`);

  let withPhoto = 0;
  let withoutPhoto = 0;
  for (const item of gymEquipment) {
    const eqSnap = await db.collection('gym_equipment').doc(item.equipmentId).get();
    if (!eqSnap.exists) {
      console.log(`  ${item.equipmentId}: MISSING from gym_equipment catalog`);
      withoutPhoto++;
      continue;
    }
    const eq = eqSnap.data()!;
    const brands: Array<{ brandName?: string; imageUrl?: string }> = eq.brands ?? [];
    // Mirrors EquipmentCard's resolution with crossBrandFallback effectively
    // true now: brandName ? exact match : brands[0].
    const brandImage = item.brandName
      ? brands.find((b) => b.brandName === item.brandName)?.imageUrl
      : brands[0]?.imageUrl;
    if (brandImage) {
      withPhoto++;
      console.log(`  ✓ ${item.equipmentId} ("${eq.name}") → real photo (${brands.length} brand(s) on doc)`);
    } else {
      withoutPhoto++;
      console.log(`  ✗ ${item.equipmentId} ("${eq.name}") → NO photo available on any brand (${brands.length} brand(s) on doc) — will still show icon/glyph`);
    }
  }

  console.log(`\n${withPhoto} of ${gymEquipment.length} will now show a real photo; ${withoutPhoto} will still show the icon/glyph fallback (equipment genuinely has no brand image in the catalog).`);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
