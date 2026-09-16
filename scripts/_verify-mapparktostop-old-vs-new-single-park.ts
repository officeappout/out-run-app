// Verification script (David's specific request, 17.09.2026) — runs the
// REAL, CURRENT mapParkToStop (imported, not copied) on V7aVC8sIVUNRnlQdT61C
// TWICE: once with the shape the OLD full-record path would have produced,
// once with the shape the NEW catalog actually produces today (mirrors the
// preview's live /api/catalog/parks response exactly). Side by side.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { mapParkToStop } from '../src/features/workout-engine/hybrid/route-stops.service';
import { classifyParkStopRole } from '../src/lib/park-stop-role';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const PARK_ID = 'V7aVC8sIVUNRnlQdT61C';

function computeHasUsableEquipment(d: any): boolean {
  const gymEquipment = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
  return gymEquipment.some((eq: any) => typeof eq?.equipmentId === 'string' && eq.equipmentId.length > 0);
}

async function main() {
  const doc = await db.collection('parks').doc(PARK_ID).get();
  const d = doc.data()!;

  // OLD shape — exactly what normalizePark (the full-record path, pre- and
  // post-redesign, unchanged) produces: raw category/facilityType/
  // natureType/urbanType/gymEquipment all present.
  const oldStyleInput: any = {
    id: PARK_ID,
    facilityType: d.facilityType,
    category: d.category, // normalizePark doesn't set this; (park as any).category was always undefined on real docs
    natureType: d.natureType,
    urbanType: d.urbanType,
    gymEquipment: Array.isArray(d.gymEquipment) ? d.gymEquipment : undefined,
    hasUsableEquipment: undefined, // full-record path never carried this — it's catalog-only
    stopRole: undefined, // full-record path never carried this either
  };

  // NEW shape — exactly what catalogEntryToPark() produces today, i.e.
  // exactly what the live preview's /api/catalog/parks + client conversion
  // hands mapParkToStop via start-hybrid-session.ts's safeFetchRealParks().
  const newStyleInput: any = {
    id: PARK_ID,
    facilityType: d.facilityType,
    hasUsableEquipment: computeHasUsableEquipment(d),
    isPrimaryFitness: true, // not used by mapParkToStop, included for shape-fidelity
    isMinor: false,
    stopRole: classifyParkStopRole({
      facilityType: d.facilityType,
      natureType: d.natureType,
      urbanType: d.urbanType,
      category: d.category,
    }),
    // deliberately NO category/natureType/urbanType/gymEquipment — the
    // catalog never carries them, exactly like the live preview response.
  };

  const oldResult = mapParkToStop(oldStyleInput);
  const newResult = mapParkToStop(newStyleInput);

  console.log('=== INPUT SHAPES ===');
  console.log('old-style input:', JSON.stringify(oldStyleInput, null, 2));
  console.log('new-style input (catalog-shaped, matches live preview):', JSON.stringify(newStyleInput, null, 2));

  console.log('\n=== mapParkToStop RESULTS, SIDE BY SIDE ===');
  console.log('OLD (full record):   ', JSON.stringify(oldResult));
  console.log('NEW (catalog record):', JSON.stringify(newResult));
  console.log('\nIDENTICAL:', JSON.stringify(oldResult) === JSON.stringify(newResult));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
