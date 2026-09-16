import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();
  let withCategory = 0;
  let categoryDiffersFromFacilityType = 0;
  const samples: any[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.category !== undefined) {
      withCategory++;
      if (d.category !== d.facilityType) {
        categoryDiffersFromFacilityType++;
        if (samples.length < 5) samples.push({ id: doc.id, category: d.category, facilityType: d.facilityType });
      }
    }
  }
  console.log(JSON.stringify({ total: snap.size, withCategory, categoryDiffersFromFacilityType, samples }, null, 2));
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
