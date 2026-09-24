/**
 * Real-execution proof for useHybridRun.skipStation()'s new aerobic-phase
 * branch (David, 25.09.2026 — the corner "X" must work during approach, not
 * only once at the station). useHybridRun.ts itself pulls in React/Zustand,
 * so this exercises the exact same controller-level calls that branch makes
 * (arrive() then skipStation(), both on HybridControllerHandle) directly,
 * proving the composition is safe: the in-progress aerobic leg's actual
 * distance/duration is recorded as of the skip moment, the station is
 * recorded skipped with ~0 duration (never entered), and the run resumes at
 * the correct next segment — WITHOUT touching hybrid-orchestrator.ts's
 * STATION_SKIPPED phase gate.
 *
 * Run: npx tsx scripts/_verify-approach-skip-composition.ts
 */

import { createHybridSessionController } from '../src/features/workout-engine/hybrid/hybrid-session-controller';
import type { HybridPlannedSegment } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';

let failures = 0;
function assert(name: string, cond: boolean, extra?: string): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

// sandwich: aerobic(A) → strength(station) → aerobic(B)
const segments: HybridPlannedSegment[] = [
  { index: 0, kind: 'aerobic', aerobicType: 'running', durationSec: 300, distanceKm: 1, fromKm: 0, toKm: 1, estCalories: 60 },
  { index: 1, kind: 'strength', stopId: 'park:test', parkId: 'test-park', lat: 31.52, lng: 34.6, content: { exercises: [], estimatedDurationSec: 300, totalPlannedSets: 8 } as any, estCalories: 40 },
  { index: 2, kind: 'aerobic', aerobicType: 'running', durationSec: 300, distanceKm: 1, fromKm: 1, toKm: 2, estCalories: 60 },
];

const controller = createHybridSessionController(segments);
controller.start(0);
assert('starts on the aerobic leg', controller.getPhase() === 'aerobic');

// Tap the corner-X 40 seconds into leg A, having covered 0.6km — mirrors
// what useHybridRun.skipStation() does when phase is still 'aerobic'.
controller.arrive(0.6, 40, 40_000);
assert('arrive() while approaching → phase becomes station', controller.getPhase() === 'station');

// Immediately skip (no real time elapsed at the station — atMs barely moved).
controller.skipStation(40_100);
assert('skipStation() right after → phase resumes to aerobic', controller.getPhase() === 'aerobic');
assert('cursor lands on segment 2 (leg B), not stuck on the station', controller.getState().cursor === 2);

const result = controller.finalize();
const legA = result.segments[0];
const station = result.segments[1];

assert('leg A actual distance = 0.6km (recorded as of the skip moment)', legA.actual?.distanceKm === 0.6, JSON.stringify(legA.actual));
assert('leg A actual duration = 40s', legA.actual?.durationSec === 40, JSON.stringify(legA.actual));
assert('station recorded skipped', station.skipped === true, JSON.stringify(station));
assert('station sets = 0 (never entered)', station.actual?.sets === 0, JSON.stringify(station.actual));
assert('station duration ~0s (100ms, rounds to 0)', station.actual?.durationSec === 0, JSON.stringify(station.actual));

// Finish leg B normally to confirm the run completes cleanly afterward.
controller.finish(1.4, 90, 130_100);
assert('finish() after an approach-skip → done', controller.getPhase() === 'done');

if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nAll passed.');
process.exit(0);
