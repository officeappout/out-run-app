/**
 * hybrid-orchestrator + hybrid-shape — pure unit tests (Phase 3a).
 *
 * No test framework on this branch — run with tsx (same convention as
 * tests/firestore-rules.test.ts):
 *   npx tsx src/features/workout-engine/hybrid/__tests__/hybrid-orchestrator.test.ts
 * Exits non-zero on any failure. Loads ONLY the two pure modules at runtime
 * (all engine/storage imports are type-only → erased).
 */

import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { StrengthBlockResult } from '../../core/pipeline/strength-block.service';
import {
  initHybridRun,
  hybridReduce,
  hybridReduceAll,
  shouldArriveAtStation,
  finalizeHybridRun,
  type HybridEvent,
} from '../hybrid-orchestrator';
import { resolveHybridShape, shapeToComposeInput } from '../hybrid-shape';

// ── tiny assert harness ─────────────────────────────────────────────────────
let failures = 0;
let total = 0;
function assert(name: string, cond: boolean, extra?: string): void {
  total += 1;
  if (cond) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq<T>(name: string, actual: T, expected: T): void {
  assert(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────
function stubContent(exCount: number, sets: number, durSec: number): StrengthBlockResult {
  return {
    exercises: Array.from({ length: exCount }, () => ({})),
    estimatedDurationSec: durSec,
    totalPlannedSets: sets,
    isEmpty: false,
    log: [],
  } as unknown as StrengthBlockResult;
}

/** Sandwich plan: aerobic legA → strength station → aerobic legB. */
function sandwichPlan(): HybridPlannedSegment[] {
  return [
    {
      index: 0, kind: 'aerobic', estCalories: 80,
      aerobicType: 'running', zone: 'jogging',
      targetPaceSecPerKm: { min: 360, max: 420 },
      durationSec: 600, distanceKm: 1.0, fromKm: 0, toKm: 1.0,
    },
    {
      index: 1, kind: 'strength', estCalories: 60,
      stopId: 'stop-A', parkId: 'park-A', locationKind: 'gym',
      activityType: 'strength', domainFocus: 'pull',
      content: stubContent(2, 9, 540), durationSec: 540,
    },
    {
      index: 2, kind: 'aerobic', estCalories: 80,
      aerobicType: 'running', zone: 'recovery',
      targetPaceSecPerKm: { min: 420, max: 480 },
      durationSec: 600, distanceKm: 1.0, fromKm: 1.0, toKm: 2.0,
    },
  ];
}

// atMs values are real milliseconds (×1000 vs. this fixture's pre-23.08.2026
// shape) — STATION_DONE's durationSec is now derived from the atMs delta
// (hybrid-orchestrator.ts bug fix), so it needs a genuine ms gap matching
// the 540-SECOND station duration this fixture intends, not a same-sized
// raw-number gap that only worked by coincidence when atMs was unused for
// the station's own duration math. Every relative gap is preserved exactly
// (uniform ×1000), so `actualDurationSec: 540` stays the meaningful "given"
// for the invalid-event-guard case below, which never reaches STATION_DONE's
// real branch (phase is 'aerobic', so it's ignored — see [6]).
const HAPPY_PATH: HybridEvent[] = [
  { type: 'START', atMs: 1_000_000 },
  { type: 'AEROBIC_TICK', cumulativeKm: 0.5, elapsedSec: 300 },
  { type: 'ARRIVE_STATION', cumulativeKm: 1.0, elapsedSec: 600, atMs: 1_600_000 },
  { type: 'STATION_DONE', completedSets: 9, actualDurationSec: 540, atMs: 2_140_000 },
  { type: 'AEROBIC_TICK', cumulativeKm: 1.5, elapsedSec: 870 },
  { type: 'FINISH', cumulativeKm: 2.0, elapsedSec: 1140, atMs: 2_680_000 },
];

// ── 1. shape resolver ───────────────────────────────────────────────────────
console.log('\n[1] hybrid-shape resolver');
{
  const s = resolveHybridShape('sandwich');
  eq('sandwich placement symmetric', s.placement, 'symmetric');
  eq('sandwich stationCount 1', s.stationCount, 1);
  eq('sandwich wired true', s.wired, true);
  eq('sandwich → stationOverride:1', shapeToComposeInput(s).stationOverride, 1);

  const rc = resolveHybridShape('runner_collects');
  eq('runner_collects placement end', rc.placement, 'end');
  eq('runner_collects domainBias core_legs', rc.domainBias, 'core_legs');
  eq('runner_collects not wired', rc.wired, false);

  const trail = resolveHybridShape('trail');
  eq('trail stationCount derived', trail.stationCount, 'derived');
  eq('derived shape emits no stationOverride', shapeToComposeInput(trail).stationOverride, undefined);
}

// ── 2. phase machine: leg → station → leg → done ────────────────────────────
console.log('\n[2] state machine transitions');
{
  let s = initHybridRun(sandwichPlan());
  eq('starts idle', s.phase, 'idle');
  s = hybridReduce(s, HAPPY_PATH[0]); eq('after START → aerobic', s.phase, 'aerobic'); eq('cursor 0', s.cursor, 0);
  s = hybridReduce(s, HAPPY_PATH[1]); eq('AEROBIC_TICK keeps aerobic', s.phase, 'aerobic');
  s = hybridReduce(s, HAPPY_PATH[2]); eq('after ARRIVE_STATION → station', s.phase, 'station'); eq('cursor 1', s.cursor, 1);
  s = hybridReduce(s, HAPPY_PATH[3]); eq('after STATION_DONE → aerobic', s.phase, 'aerobic'); eq('cursor 2', s.cursor, 2);
  s = hybridReduce(s, HAPPY_PATH[4]); eq('legB tick keeps aerobic', s.phase, 'aerobic');
  s = hybridReduce(s, HAPPY_PATH[5]); eq('after FINISH → done', s.phase, 'done');
}

// ── 3. finalize (default) → 3 records, correct slicing ──────────────────────
console.log('\n[3] finalize default → 3 records (legA / station / legB)');
{
  const s = hybridReduceAll(initHybridRun(sandwichPlan()), HAPPY_PATH);
  const { segments, summary } = finalizeHybridRun(s);
  eq('3 records', segments.length, 3);

  const [legA, station, legB] = segments;
  eq('legA kind', legA.kind, 'aerobic');
  eq('legA actual distanceKm sliced (1.0-0)', legA.actual?.distanceKm, 1.0);
  eq('legA actual durationSec (600-0)', legA.actual?.durationSec, 600);
  eq('legA planned paceMinKm midpoint 6.5', legA.planned?.paceMinKm, 6.5);
  eq('legA aerobicType running', legA.aerobicType, 'running');
  eq('legA startedAtMs', legA.startedAtMs, 1_000_000);
  eq('legA endedAtMs', legA.endedAtMs, 1_600_000);

  eq('station kind', station.kind, 'strength');
  eq('station actual sets 9', station.actual?.sets, 9);
  eq('station actual durationSec 540', station.actual?.durationSec, 540);
  eq('station planned sets 9', station.planned?.sets, 9);
  eq('station planned exercises 2', station.planned?.exercises, 2);
  eq('station parkId', station.parkId, 'park-A');
  eq('station has no distanceKm', station.actual?.distanceKm, undefined);

  eq('legB actual distanceKm sliced (2.0-1.0)', legB.actual?.distanceKm, 1.0);
  eq('legB actual durationSec sliced (1140-600)', legB.actual?.durationSec, 540);
  eq('legB startedAtMs (station end)', legB.startedAtMs, 2_140_000);
  eq('legB endedAtMs', legB.endedAtMs, 2_680_000);

  eq('summary completedAerobic 2', summary.completedAerobicSegments, 2);
  eq('summary completedStrength 1', summary.completedStrengthSegments, 1);
  eq('summary totalActualAerobicSec 1140', summary.totalActualAerobicSec, 1140);
  eq('summary totalActualDistanceKm 2.0', summary.totalActualDistanceKm, 2.0);
  eq('summary totalStrengthSets 9', summary.totalStrengthSets, 9);
  eq('summary bothHalvesCompleted (LAW-10 gate)', summary.bothHalvesCompleted, true);
}

// ── 4. finalize (merge) → 2 records (run + station) ─────────────────────────
console.log('\n[4] finalize mergeAerobicLegs → 2 records (run + station)');
{
  const s = hybridReduceAll(initHybridRun(sandwichPlan()), HAPPY_PATH);
  const { segments } = finalizeHybridRun(s, { mergeAerobicLegs: true });
  eq('2 records', segments.length, 2);

  const [run, station] = segments;
  eq('merged record kind aerobic', run.kind, 'aerobic');
  eq('merged actual durationSec (600+540)', run.actual?.durationSec, 1140);
  eq('merged actual distanceKm (1.0+1.0)', run.actual?.distanceKm, 2.0);
  eq('merged planned durationSec (600+600)', run.planned?.durationSec, 1200);
  eq('merged planned distanceKm 2.0', run.planned?.distanceKm, 2.0);
  eq('merged index 0', run.index, 0);
  eq('station is 2nd record', station.kind, 'strength');
  eq('station re-indexed to 1', station.index, 1);
}

// ── 5. shouldArriveAtStation threshold ──────────────────────────────────────
console.log('\n[5] shouldArriveAtStation (distance threshold)');
{
  const started = hybridReduce(initHybridRun(sandwichPlan()), { type: 'START' });
  assert('below toKm → false', shouldArriveAtStation(started, 0.9) === false);
  assert('at toKm → true', shouldArriveAtStation(started, 1.0) === true);
  assert('past toKm → true', shouldArriveAtStation(started, 1.2) === true);
  assert('idle state → false', shouldArriveAtStation(initHybridRun(sandwichPlan()), 5) === false);
}

// ── 6. invalid events are ignored (no throw, no state change) ────────────────
console.log('\n[6] invalid-event guards');
{
  const started = hybridReduce(initHybridRun(sandwichPlan()), { type: 'START' });
  const after = hybridReduce(started, { type: 'STATION_DONE', completedSets: 3, actualDurationSec: 100 });
  eq('STATION_DONE in aerobic → phase unchanged', after.phase, 'aerobic');
  eq('cursor unchanged', after.cursor, 0);
  assert('logged an "ignored" note', after.log.some((l) => l.includes('ignored STATION_DONE')));
  eq('double START ignored', hybridReduce(started, { type: 'START' }).phase, 'aerobic');

  // Empty plan finishes immediately on START.
  eq('empty plan START → done', hybridReduce(initHybridRun([]), { type: 'START' }).phase, 'done');
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} assertions passed`);
if (failures > 0) { console.error(`${failures} FAILED`); process.exit(1); }
process.exit(0);
