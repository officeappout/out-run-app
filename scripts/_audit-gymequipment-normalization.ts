// Read-only investigation script (SPEC-07, David's normalization question).
// Mirrors the real logic in park-equipment.util.ts's parkGymEquipmentToGearIds:
// gymEquipment fails to normalize to usable gear ONLY when every entry lacks
// equipmentId — normalizeGearId itself has an unconditional fallback (echoes
// the lowercased input), so it never produces empty output for a non-empty
// equipmentId string.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();

  let publishedTotal = 0;
  let withNonEmptyGymEquipment = 0;
  let allEntriesMissingEquipmentId = 0; // the real failure case
  let mixedSomeMissingSomeNot = 0;
  const failingSamples: { id: string; name: string; gymEquipment: unknown }[] = [];
  const mixedSamples: { id: string; name: string; gymEquipment: unknown }[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const published = d.published ?? (d.contentStatus === 'published');
    if (!published) continue;
    publishedTotal++;

    const gymEquipment = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
    if (gymEquipment.length === 0) continue;
    withNonEmptyGymEquipment++;

    const withId = gymEquipment.filter((e: any) => e && typeof e.equipmentId === 'string' && e.equipmentId.trim().length > 0);
    if (withId.length === 0) {
      allEntriesMissingEquipmentId++;
      if (failingSamples.length < 5) {
        failingSamples.push({ id: doc.id, name: d.name, gymEquipment });
      }
    } else if (withId.length < gymEquipment.length) {
      mixedSomeMissingSomeNot++;
      if (mixedSamples.length < 3) {
        mixedSamples.push({ id: doc.id, name: d.name, gymEquipment });
      }
    }
  }

  console.log(JSON.stringify({
    publishedTotal,
    withNonEmptyGymEquipment,
    allEntriesMissingEquipmentId_trueFailures: allEntriesMissingEquipmentId,
    mixedSomeMissingSomeNot_stillSucceed: mixedSomeMissingSomeNot,
    failingSamples,
    mixedSamples,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
