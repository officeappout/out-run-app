// TEMP-DIAG repro script — real execution against the BROKEN (pre-revert)
// code, hitting the ACTUAL running local server (port 3000) for the
// relative-URL fetch that failed as a pure-Node artifact last time.
// Script-only patch (no source file touched) so /api/catalog/parks
// resolves against the live local server instead of throwing.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return realFetch(`http://localhost:3000${input}`, init);
  }
  return realFetch(input, init);
}) as typeof fetch;

import { resolveParkEquipmentIds } from '@/features/workout-engine/services/park-equipment-resolver';

const PARK_LAT = 32.06140973845362;
const PARK_LNG = 34.775086641311646;

async function main() {
  console.log('=== TASK 1 REPRO: resolveParkEquipmentIds against BROKEN pre-revert code, real local server ===');
  const fakeProfile: any = { firstWorkoutParkId: undefined };
  const ids = await resolveParkEquipmentIds(fakeProfile, {
    gpsCoords: { lat: PARK_LAT, lng: PARK_LNG },
  });
  console.log('=== FINAL RESULT ===', ids.length, ids);
}

main().then(() => process.exit(0)).catch((err) => { console.error('SCRIPT ERROR:', err); process.exit(1); });
