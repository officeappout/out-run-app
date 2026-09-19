/**
 * DIAGNOSTIC — Stage 2 field-test verification (19.09.2026), David's P0.
 *
 * docs/field-test/01-walking-flow-map.md flagged (read-only) that
 * FreeRunLayer.tsx:102-133 reads `official_routes/{id}` and casts
 * `snap.data().path` straight to `[number,number][]` via a TypeScript `as`
 * assertion — WITHOUT calling normalizeStoredRoutePath first — even though
 * `routePath.ts`'s own header comment documents the real Firestore storage
 * shape as `{lng,lat}` OBJECTS, not tuples.
 *
 * This script proves or disproves, numerically, what actually happens when
 * that raw (un-normalized) path is fed into the two real downstream
 * consumers that destructure it as `point[0]`/`point[1]`.
 *
 * Run: npx tsx scripts/_verify-freerunlayer-geometry-nan.ts
 */
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { buildLaneOffsetPath, crossTrackDistanceMeters, isOutAndBackPath } from '../src/features/parks/core/services/geoUtils';

function section(title: string) {
  console.log('\n=== ' + title + ' ===');
}

// Realistic official_routes.path exactly as Firestore stores it — an
// out-and-back walking route at Sderot-scale coordinates, as {lng,lat}
// objects (InventoryService.saveRoutes' documented storage shape,
// routePath.ts:4-9). 5 points, odd length, mirrored — a real out-and-back
// shape, the exact case buildLaneOffsetPath is meant to detect.
const REAL_STORED_PATH_OBJECTS = [
  { lng: 34.5978, lat: 31.5251 },
  { lng: 34.5985, lat: 31.5258 },
  { lng: 34.5992, lat: 31.5264 },
  { lng: 34.5985, lat: 31.5258 },
  { lng: 34.5978, lat: 31.5251 },
];

section('1. Exact FreeRunLayer.tsx:102-133 bug reproduction — raw TS cast, zero runtime transformation');
// This is precisely what FreeRunLayer.tsx does: `data.path as [number,number][]`
// is a compile-time-only assertion. At runtime `path` is still the raw
// {lng,lat} object array.
const buggyPath = REAL_STORED_PATH_OBJECTS as unknown as [number, number][];
console.log('buggyPath[0] (raw):', buggyPath[0]);
console.log('buggyPath[0][0] (what array-index code reads as "lng"):', (buggyPath[0] as unknown as Record<string, number>)[0]);
console.log('buggyPath[0][1] (what array-index code reads as "lat"):', (buggyPath[0] as unknown as Record<string, number>)[1]);

section('1a. isOutAndBackPath(buggyPath) — the FIRST thing buildLaneOffsetPath calls');
try {
  const r = isOutAndBackPath(buggyPath);
  console.log('Returned (no throw):', r);
} catch (e) {
  console.log('THREW:', (e as Error).constructor.name, '-', (e as Error).message);
}

section('1b. buildLaneOffsetPath(buggyPath, 3) — full call as AppMap would make it');
try {
  const laneOffsetBuggy = buildLaneOffsetPath(buggyPath, 3);
  console.log('No throw. Output:', JSON.stringify(laneOffsetBuggy));
  console.log('Contains NaN?', laneOffsetBuggy.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1])));
} catch (e) {
  console.log('THREW:', (e as Error).constructor.name, '-', (e as Error).message);
}

section('1c. crossTrackDistanceMeters(pos, buggyPath) — route-deviation-detection call as useRunningPlayer would make it');
try {
  const crossTrackBuggy = crossTrackDistanceMeters({ lat: 31.5255, lng: 34.598 }, buggyPath as unknown as number[][]);
  console.log('No throw. Output:', crossTrackBuggy, crossTrackBuggy === Infinity ? '← Infinity: silently treated as "always off-route", not a thrown error' : 'meters');
} catch (e) {
  console.log('THREW:', (e as Error).constructor.name, '-', (e as Error).message);
}

section('2. Same data, correctly normalized first (what the code SHOULD do)');
const normalized = normalizeStoredRoutePath(REAL_STORED_PATH_OBJECTS);
console.log('normalized[0]:', normalized[0]);
const laneOffsetFixed = buildLaneOffsetPath(normalized, 3);
console.log('buildLaneOffsetPath output:', JSON.stringify(laneOffsetFixed));
console.log('Contains NaN?', laneOffsetFixed.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1])));
const crossTrackFixed = crossTrackDistanceMeters({ lat: 31.5255, lng: 34.598 }, normalized);
console.log('crossTrackDistanceMeters output:', crossTrackFixed, 'meters');

section('3. Corrupted-input variants through normalizeStoredRoutePath (the correct entry point)');
const variants: Record<string, unknown> = {
  'missing points (array of length 1)': [{ lng: 34.5978, lat: 31.5251 }],
  'empty array': [],
  'null entries mixed in': [{ lng: 34.5978, lat: 31.5251 }, null, { lng: 34.5985, lat: 31.5258 }],
  'undefined entries mixed in': [{ lng: 34.5978, lat: 31.5251 }, undefined, { lng: 34.5985, lat: 31.5258 }],
  'reversed lat/lng KEY NAMES (semantic swap — NOT caught by finiteness check)': [{ lng: 31.5251, lat: 34.5978 }],
  'out-of-range lat (>90)': [{ lng: 34.5978, lat: 200 }],
  'out-of-range lng (>180)': [{ lng: 500, lat: 31.5251 }],
  'string numbers instead of numbers': [{ lng: '34.5978', lat: '31.5251' }],
  'correct [lng,lat] tuple shape (control)': [[34.5978, 31.5251]],
};
for (const [name, input] of Object.entries(variants)) {
  try {
    const result = normalizeStoredRoutePath(input as never);
    console.log(`- ${name}:\n    → ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`- ${name}:\n    → THREW: ${(e as Error).message}`);
  }
}

section('4. Verdict inputs for the field-test doc');
console.log('Does the guided/group-session code path crash or silently corrupt data when fed real Firestore geometry unnormalized? See sections 1a-1c above for the actual captured behavior.');
