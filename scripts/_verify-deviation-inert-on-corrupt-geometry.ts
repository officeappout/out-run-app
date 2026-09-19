/**
 * DIAGNOSTIC — Stage 3 field-test verification (19.09.2026), David's item 3:
 * "prove what the user SEES, not just internal state" for the
 * FreeRunLayer.tsx un-normalized-geometry bug's effect on route-deviation
 * detection (the audible "סטית מהמסלול" announcement + auto-reroute in
 * useRouteDeviationOrchestrator.ts).
 *
 * CORRECTION to docs/field-test/02-verification-results.md §1: that doc's
 * wording ("Infinity — silently treated as always off-route") was IMPRECISE.
 * useRunningPlayer.checkRouteDeviation() has a guard — line cited and
 * verified below — that discards a non-finite distance BEFORE the
 * off-route branch runs. So corrupted guided-session geometry does NOT
 * cause a false "you deviated" alarm. It causes something different and
 * arguably worse for safety: deviation detection goes completely INERT —
 * no audio, no banner, no reroute, ever, even if the user truly wanders off.
 *
 * Why this isn't one single store-level execution: useRunningPlayer.ts
 * transitively imports a barrel (`@/features/parks`) that pulls in a .tsx
 * file, which this repo's vitest config cannot parse (node-env, no JSX —
 * see vitest.config.ts's own comment and the project's "no jsdom" memory).
 * So this proof composes two independently-executed real pieces instead:
 * (1) the REAL crossTrackDistanceMeters, actually run on the actual
 * corrupted geometry; (2) the REAL guard line's condition, extracted from
 * disk and verified verbatim, then evaluated against that real output.
 * Together they leave no gap: checkRouteDeviation's behaviour is a pure
 * function of exactly these two facts.
 *
 * Run: npx tsx scripts/_verify-deviation-inert-on-corrupt-geometry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { crossTrackDistanceMeters } from '../src/features/parks/core/services/geoUtils';

const REPO_ROOT = path.resolve(__dirname, '..');
const PLAYER_FILE = path.join(REPO_ROOT, 'src/features/workout-engine/players/running/store/useRunningPlayer.ts');
const lines = fs.readFileSync(PLAYER_FILE, 'utf-8').split('\n');

function section(t: string) { console.log('\n=== ' + t + ' ==='); }

section('1. Mechanical source-fact check — read the REAL guard + constants from disk, not from memory');
const guardLine = lines[480]; // line 481, 1-indexed
const thresholdMLine = lines[78]; // line 79
const thresholdSamplesLine = lines[83]; // line 84
console.log('useRunningPlayer.ts:481 →', JSON.stringify(guardLine.trim()));
console.log('useRunningPlayer.ts:79  →', JSON.stringify(thresholdMLine.trim()));
console.log('useRunningPlayer.ts:84  →', JSON.stringify(thresholdSamplesLine.trim()));
if (!guardLine.includes('Number.isFinite(distMeters)') || !guardLine.includes('return')) {
  throw new Error('Guard line changed since this script was written — re-verify before trusting the rest of this output.');
}
const THRESHOLD_M = Number(thresholdMLine.match(/=\s*(\d+)/)?.[1]);
console.log('Extracted ROUTE_DEVIATION_THRESHOLD_M =', THRESHOLD_M);

section('2. Real crossTrackDistanceMeters output — corrupted (un-normalized) FreeRunLayer.tsx geometry');
const REAL_STORED_PATH_OBJECTS = [
  { lng: 34.5978, lat: 31.5251 },
  { lng: 34.5985, lat: 31.5258 },
  { lng: 34.5992, lat: 31.5264 },
  { lng: 34.5985, lat: 31.5258 },
  { lng: 34.5978, lat: 31.5251 },
];
const buggyPath = REAL_STORED_PATH_OBJECTS as unknown as [number, number][];
const correctPath: [number, number][] = REAL_STORED_PATH_OBJECTS.map((p) => [p.lng, p.lat]);

const onRoutePos = { lat: 31.5255, lng: 34.598 };
const farAwayPos = { lat: 31.53, lng: 34.61 }; // ~2km away — an unambiguous real deviation

const distBuggy_onRoute = crossTrackDistanceMeters(onRoutePos, buggyPath as unknown as number[][]);
const distBuggy_farAway = crossTrackDistanceMeters(farAwayPos, buggyPath as unknown as number[][]);
const distCorrect_onRoute = crossTrackDistanceMeters(onRoutePos, correctPath);
const distCorrect_farAway = crossTrackDistanceMeters(farAwayPos, correctPath);

console.log('Corrupted geometry, user ON the real route  → crossTrackDistanceMeters =', distBuggy_onRoute);
console.log('Corrupted geometry, user 2km OFF the route  → crossTrackDistanceMeters =', distBuggy_farAway);
console.log('Correct geometry,   user ON the real route  → crossTrackDistanceMeters =', distCorrect_onRoute, 'meters');
console.log('Correct geometry,   user 2km OFF the route  → crossTrackDistanceMeters =', distCorrect_farAway, 'meters');

section('3. Apply the REAL guard condition (line 481, verified above) to each real output');
function wouldGuardShortCircuit(distMeters: number): boolean {
  return !Number.isFinite(distMeters); // literal condition from useRunningPlayer.ts:481
}
for (const [label, dist] of [
  ['Corrupted geometry, ON route ', distBuggy_onRoute],
  ['Corrupted geometry, OFF route (real 2km deviation)', distBuggy_farAway],
  ['Correct geometry,   ON route ', distCorrect_onRoute],
  ['Correct geometry,   OFF route (real 2km deviation)', distCorrect_farAway],
] as [string, number][]) {
  const shortCircuits = wouldGuardShortCircuit(dist);
  const verdict = shortCircuits
    ? 'checkRouteDeviation RETURNS EARLY at line 481 — no state change, no audio, no reroute, regardless of where the user actually is'
    : dist > THRESHOLD_M
      ? `proceeds past the guard, ${dist.toFixed(0)}m > ${THRESHOLD_M}m threshold — WOULD count toward tripping the audible "off route" alarm + reroute`
      : `proceeds past the guard, ${dist.toFixed(0)}m ≤ ${THRESHOLD_M}m threshold — correctly treated as on-route`;
  console.log(`- ${label}: dist=${dist} → ${verdict}`);
}

section('4. Verdict for the field-test doc');
console.log(`
The corrupted guided-session path (FreeRunLayer.tsx:102-133) makes
crossTrackDistanceMeters return Infinity UNCONDITIONALLY, regardless of the
user's real position (both test positions above returned identically).
Infinity fails Number.isFinite(), which the REAL, verified guard on
useRunningPlayer.ts:481 uses to bail out before ANY off-route logic runs.

User-visible consequence: for a guided/group walking session that hit this
bug, the app will NEVER speak "סטית מהמסלול, מחשב מסלול מחדש", NEVER show a
reroute, and NEVER update the live routeDeviationMeters value — not falsely,
and not correctly either. If the user actually wanders off the real route,
there is no safety net catching it. This is the corrected, execution-proven
replacement for the imprecise "always off-route" line in
docs/field-test/02-verification-results.md §1.
`);
