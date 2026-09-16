// Verification script (SPEC-07 stopRole migration, 17.09.2026) — runs the
// OLD mapParkToStop logic (copied verbatim, pre-change) and the NEW
// hasUsableEquipment/facilityType + classifyParkStopRole combination
// against every real published park doc, and diffs the results.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

type StopMapping = { activityType: string; locationKind: string; cooldownEligible: boolean };

// OLD logic — copied verbatim from route-stops.service.ts's mapParkToStop
// as it stood before this migration.
function oldMapParkToStop(park: any): StopMapping | null {
  const facility = park.category ?? park.facilityType;
  const nature = park.natureType;
  const urban = park.urbanType;
  const equipped = (park.gymEquipment?.length ?? 0) > 0;

  if (facility === 'gym_park' || equipped) {
    return { activityType: 'strength', locationKind: 'gym', cooldownEligible: false };
  }
  if (nature === 'observation_point') return { activityType: 'stretch', locationKind: 'viewpoint', cooldownEligible: true };
  if (nature === 'spring') return { activityType: 'stretch', locationKind: 'spring', cooldownEligible: true };
  if (facility === 'nature_community') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'zen_spot') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'urban_spot') {
    if (urban === 'stairs') return { activityType: 'strength', locationKind: 'stairs', cooldownEligible: false };
    return { activityType: 'core', locationKind: 'bench', cooldownEligible: false };
  }
  return null;
}

// NEW logic — hasUsableEquipment computed the same way route.ts computes it
// (mirrors computeHasUsableEquipment), then classifyParkStopRole for the rest.
function computeHasUsableEquipment(d: any): boolean {
  const gymEquipment = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
  return gymEquipment.some((eq: any) => typeof eq?.equipmentId === 'string' && eq.equipmentId.length > 0);
}

function classifyParkStopRole(input: { facilityType?: string; natureType?: string; urbanType?: string; category?: string }): StopMapping | null {
  const facility = input.category ?? input.facilityType;
  const nature = input.natureType;
  const urban = input.urbanType;

  if (nature === 'observation_point') return { activityType: 'stretch', locationKind: 'viewpoint', cooldownEligible: true };
  if (nature === 'spring') return { activityType: 'stretch', locationKind: 'spring', cooldownEligible: true };
  if (facility === 'nature_community') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'zen_spot') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'urban_spot') {
    if (urban === 'stairs') return { activityType: 'strength', locationKind: 'stairs', cooldownEligible: false };
    return { activityType: 'core', locationKind: 'bench', cooldownEligible: false };
  }
  return null;
}

function newMapParkToStop(d: any): StopMapping | null {
  const facilityType = d.facilityType;
  const hasUsableEquipment = computeHasUsableEquipment(d);
  if (facilityType === 'gym_park' || hasUsableEquipment) {
    return { activityType: 'strength', locationKind: 'gym', cooldownEligible: false };
  }
  return classifyParkStopRole({ facilityType, natureType: d.natureType, urbanType: d.urbanType, category: d.category });
}

async function main() {
  const snap = await db.collection('parks').get();
  let total = 0;
  let published = 0;
  let mismatches = 0;
  const mismatchSamples: any[] = [];

  for (const doc of snap.docs) {
    total++;
    const d = doc.data();
    const isPublished = d.published ?? (d.contentStatus === 'published');
    if (!isPublished) continue;
    published++;

    const oldResult = oldMapParkToStop(d);
    const newResult = newMapParkToStop(d);
    const same = JSON.stringify(oldResult) === JSON.stringify(newResult);
    if (!same) {
      mismatches++;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push({ id: doc.id, name: d.name, facilityType: d.facilityType, natureType: d.natureType, urbanType: d.urbanType, category: d.category, gymEquipmentLength: d.gymEquipment?.length, oldResult, newResult });
      }
    }
  }

  console.log(JSON.stringify({ totalDocs: total, publishedDocs: published, mismatches, mismatchSamples }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
