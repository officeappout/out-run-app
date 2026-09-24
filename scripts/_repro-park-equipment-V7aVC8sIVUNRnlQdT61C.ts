// TEMP-DIAG repro script — verifying the revert restores the correct
// behavior. Real execution against production Firestore via the client SDK.
import { resolveParkEquipmentIds } from '@/features/workout-engine/services/park-equipment-resolver';

const PARK_LAT = 32.06140973845362;
const PARK_LNG = 34.775086641311646;

async function main() {
  console.log('=== REVERT VERIFICATION: resolveParkEquipmentIds at V7aVC8sIVUNRnlQdT61C coords ===');
  const fakeProfile: any = { firstWorkoutParkId: undefined };
  const ids = await resolveParkEquipmentIds(fakeProfile, {
    gpsCoords: { lat: PARK_LAT, lng: PARK_LNG },
  });
  console.log('=== FINAL RESULT (should be 17 non-empty ids) ===', ids.length, ids);
}

main().then(() => process.exit(0)).catch((err) => { console.error('SCRIPT ERROR:', err); process.exit(1); });
