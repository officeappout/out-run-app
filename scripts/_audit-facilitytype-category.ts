// Read-only investigation script (SPEC-07 stage 2, David's request re: dead fields).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();
  const categoryValues: Record<string, number> = {};
  const facilityTypeValues: Record<string, number> = {};
  let hasCategory = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.category !== undefined) {
      hasCategory++;
      categoryValues[String(d.category)] = (categoryValues[String(d.category)] ?? 0) + 1;
    }
    const ft = String(d.facilityType ?? '(missing)');
    facilityTypeValues[ft] = (facilityTypeValues[ft] ?? 0) + 1;
  }

  console.log(JSON.stringify({ total: snap.size, hasCategoryField: hasCategory, categoryValues, facilityTypeValues }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
