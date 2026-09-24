/**
 * Real-execution proof for isApproachingStation (station-approach moment,
 * David, 25.09.2026). Confirms the 56m/120m thresholds trigger and release
 * exactly where expected, using the SAME destinationPoint/haversineMeters
 * geo math the rest of the codebase already relies on (out-and-back lane
 * offsetting, route-deviation distance) — not synthetic epsilon numbers.
 *
 * Run: npx tsx scripts/_verify-station-approach-distance.ts
 */

import { destinationPoint } from '../src/features/parks/core/services/geoUtils';
import { isApproachingStation } from '../src/features/workout-engine/hybrid/hybrid-orchestrator';

let failures = 0;
function assert(name: string, cond: boolean): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}`); }
}

// Arbitrary real-world-scale origin (a Sderot-area coordinate, matching the
// pilot city) — the math is bearing/distance-relative, so the exact origin
// doesn't matter, only that it's a real lat/lng, not (0,0).
const STATION_LAT = 31.5256;
const STATION_LNG = 34.5967;

function pointAt(distanceMeters: number, bearingDeg: number): { lat: number; lng: number } {
  const [lng, lat] = destinationPoint(STATION_LAT, STATION_LNG, distanceMeters, bearingDeg);
  return { lat, lng };
}

console.log('── walking (56m threshold) ──');
{
  const just_inside = pointAt(55, 90);
  const just_outside = pointAt(57, 90);
  const well_inside_noise = pointAt(30, 200); // typical GPS jitter scale, well inside
  const well_outside = pointAt(200, 45);
  assert('55m → approaching (inside)', isApproachingStation(just_inside.lat, just_inside.lng, STATION_LAT, STATION_LNG, 'walking') === true);
  assert('57m → NOT approaching (outside)', isApproachingStation(just_outside.lat, just_outside.lng, STATION_LAT, STATION_LNG, 'walking') === false);
  assert('30m (GPS-noise scale) → approaching', isApproachingStation(well_inside_noise.lat, well_inside_noise.lng, STATION_LAT, STATION_LNG, 'walking') === true);
  assert('200m → NOT approaching', isApproachingStation(well_outside.lat, well_outside.lng, STATION_LAT, STATION_LNG, 'walking') === false);
}

console.log('── running (120m threshold) ──');
{
  const just_inside = pointAt(119, 270);
  const just_outside = pointAt(121, 270);
  const well_inside = pointAt(80, 10);
  const well_outside = pointAt(300, 130);
  assert('119m → approaching (inside)', isApproachingStation(just_inside.lat, just_inside.lng, STATION_LAT, STATION_LNG, 'running') === true);
  assert('121m → NOT approaching (outside)', isApproachingStation(just_outside.lat, just_outside.lng, STATION_LAT, STATION_LNG, 'running') === false);
  assert('80m → approaching', isApproachingStation(well_inside.lat, well_inside.lng, STATION_LAT, STATION_LNG, 'running') === true);
  assert('300m → NOT approaching', isApproachingStation(well_outside.lat, well_outside.lng, STATION_LAT, STATION_LNG, 'running') === false);
}

console.log('── cross-check: walking threshold does NOT leak into running distances ──');
{
  // 100m is within the RUNNING threshold (120m) but outside the WALKING one
  // (56m) — confirms the two constants are actually independent, not one
  // shared value silently reused.
  const p = pointAt(100, 0);
  assert('100m + running=true', isApproachingStation(p.lat, p.lng, STATION_LAT, STATION_LNG, 'running') === true);
  assert('100m + walking=false', isApproachingStation(p.lat, p.lng, STATION_LAT, STATION_LNG, 'walking') === false);
}

if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nAll passed.');
process.exit(0);
