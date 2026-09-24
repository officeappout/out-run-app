// Read-only investigation script — urgent regression triage (16.09.2026).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const doc = await db.collection('parks').doc('V7aVC8sIVUNRnlQdT61C').get();
  if (!doc.exists) {
    console.log(JSON.stringify({ exists: false }));
    return;
  }
  const d = doc.data()!;
  console.log(JSON.stringify({
    exists: true,
    name: d.name,
    facilityType: d.facilityType,
    published: d.published,
    contentStatus: d.contentStatus,
    gymEquipmentLength: Array.isArray(d.gymEquipment) ? d.gymEquipment.length : `NOT_ARRAY: ${typeof d.gymEquipment}`,
    gymEquipment: d.gymEquipment ?? null,
    hasUsableEquipmentComputed: Array.isArray(d.gymEquipment) && d.gymEquipment.some((g: any) => !!g?.equipmentId),
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
