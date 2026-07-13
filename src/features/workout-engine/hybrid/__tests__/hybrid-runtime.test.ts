/**
 * hybrid runtime spine — pure unit tests (Phase 3b).
 * Run: npx tsx src/features/workout-engine/hybrid/__tests__/hybrid-runtime.test.ts
 * Loads only the pure modules at runtime (compose/storage imports are type-only).
 */

import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { StrengthBlockResult } from '../../core/pipeline/strength-block.service';
import {
  shareToEmphasis,
  splitMinutes,
  splitHelperText,
  buildSandwichComposeInput,
  RECOMMENDED_AEROBIC_SHARE,
  type SandwichInputArgs,
} from '../build-hybrid-input';
import { resolveHybridShape } from '../hybrid-shape';
import { createHybridSessionController } from '../hybrid-session-controller';
import { buildHybridWorkoutEntry } from '../hybrid-save.service';
import { runnerShouldSelfSave } from '../hybrid-finish-policy';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';
import { parkGymEquipmentToGearIds } from '../park-equipment.util';

let failures = 0;
let total = 0;
function eq<T>(name: string, actual: T, expected: T): void {
  total += 1;
  const ok = actual === expected;
  if (ok) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}
function ok(name: string, cond: boolean): void {
  total += 1;
  if (cond) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}`); }
}

function stubContent(exCount: number, sets: number, durSec: number): StrengthBlockResult {
  return {
    exercises: Array.from({ length: exCount }, () => ({})),
    estimatedDurationSec: durSec,
    totalPlannedSets: sets,
    isEmpty: false,
    log: [],
  } as unknown as StrengthBlockResult;
}

function sandwichPlan(): HybridPlannedSegment[] {
  return [
    { index: 0, kind: 'aerobic', estCalories: 80, aerobicType: 'running', zone: 'jogging',
      targetPaceSecPerKm: { min: 360, max: 420 }, durationSec: 600, distanceKm: 1.0, fromKm: 0, toKm: 1.0 },
    { index: 1, kind: 'strength', estCalories: 60, stopId: 'stop-A', parkId: 'park-A',
      locationKind: 'gym', activityType: 'strength', domainFocus: 'pull', content: stubContent(2, 9, 540), durationSec: 540 },
    { index: 2, kind: 'aerobic', estCalories: 80, aerobicType: 'running', zone: 'recovery',
      targetPaceSecPerKm: { min: 420, max: 480 }, durationSec: 600, distanceKm: 1.0, fromKm: 1.0, toKm: 2.0 },
  ];
}

// ── 1. shareToEmphasis boundaries ───────────────────────────────────────────
console.log('\n[1] shareToEmphasis / splitMinutes');
{
  eq('0.30 → strength', shareToEmphasis(0.30), 'strength');
  eq('0.44 → strength', shareToEmphasis(0.44), 'strength');
  eq('0.45 → balanced', shareToEmphasis(0.45), 'balanced');
  eq('0.55 (recommended) → balanced', shareToEmphasis(RECOMMENDED_AEROBIC_SHARE), 'balanced');
  eq('0.62 → balanced', shareToEmphasis(0.62), 'balanced');
  eq('0.625 → aerobic', shareToEmphasis(0.625), 'aerobic');
  eq('0.70 → aerobic', shareToEmphasis(0.70), 'aerobic');

  const s = splitMinutes(40, 0.55);
  eq('split 40@0.55 aerobic', s.aerobicMin, 22);
  eq('split 40@0.55 strength', s.strengthMin, 18);
  ok('helper text mentions minutes', splitHelperText('time', 40, 0.55, 1).includes('22'));
  ok('helper text single station wording', splitHelperText('time', 40, 0.55, 1).includes('תחנה אחת'));
}

// ── 2. buildSandwichComposeInput → stationOverride 1 + passthrough ──────────
console.log('\n[2] buildSandwichComposeInput');
{
  const args = {
    timeBudgetMin: 40,
    emphasis: 'balanced',
    aerobicKind: 'running',
    paceProfile: { basePace: 390, profileType: 2 },
    routePath: [[0, 0], [0, 1]],
    stopCandidates: [],
    masterExercises: [],
    filterContext: {},
    generationContext: {},
    weeklyGaps: { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] },
    userWeightKg: 75,
    shape: resolveHybridShape('sandwich'),
  } as unknown as SandwichInputArgs;
  const input = buildSandwichComposeInput(args);
  eq('sandwich → stationOverride 1', input.stationOverride, 1);
  eq('emphasis passthrough', input.emphasis, 'balanced');
  eq('timeBudget passthrough', input.timeBudgetMin, 40);
  eq('userWeight passthrough', input.userWeightKg, 75);
}

// ── 3. createHybridSessionController — full run ─────────────────────────────
console.log('\n[3] controller run → 3 records');
let finalizeResult: ReturnType<ReturnType<typeof createHybridSessionController>['finalize']>;
{
  const c = createHybridSessionController(sandwichPlan());
  eq('idle', c.getPhase(), 'idle');
  c.start(1000);
  eq('→ aerobic', c.getPhase(), 'aerobic');
  const reached = c.tick(1.0, 600);
  ok('tick at toKm signals arrival', reached === true);
  c.arrive(1.0, 600, 1600);
  eq('→ station', c.getPhase(), 'station');
  ok('activeStation exposed', c.getActiveStation()?.stopId === 'stop-A');
  c.completeStation(9, 540, 2140);
  eq('→ aerobic (legB)', c.getPhase(), 'aerobic');
  c.finish(2.0, 1140, 2680);
  eq('→ done', c.getPhase(), 'done');

  finalizeResult = c.finalize();
  eq('finalize 3 records', finalizeResult.segments.length, 3);
  eq('both halves complete', finalizeResult.summary.bothHalvesCompleted, true);
}

// ── 4. buildHybridWorkoutEntry — the single hybrid doc ─────────────────────
console.log('\n[4] buildHybridWorkoutEntry');
{
  const doc = buildHybridWorkoutEntry(finalizeResult, {
    userId: 'user-1', aerobicKind: 'running', totalCalories: 240,
  });
  eq('activityType hybrid', doc.activityType, 'hybrid');
  eq('3 segment records', doc.segments?.length, 3);
  eq('distance = aerobic total', doc.distance, 2.0);
  eq('duration = sum actual sec (600+540+540)', doc.duration, 1680);
  eq('calories from meta', doc.calories, 240);
  eq('setsCompleted from summary', doc.setsCompleted, 9);
  eq('earnedCoins 0 (§8 deferred)', doc.earnedCoins, 0);
  eq('pace = aerobic min/km (1140/60/2)', doc.pace, 9.5);
  ok('no workoutType key (saveWorkout derives it)', !('workoutType' in doc));
}

// ── 5. single-save invariant (normal = 1 doc, hybrid = 1 doc) ──────────────
console.log('\n[5] single-save invariant');
{
  const normalRunnerSaves = runnerShouldSelfSave(false) ? 1 : 0; // runner self-saves
  eq('normal: runner self-saves (1)', normalRunnerSaves, 1);
  eq('normal: total docs = 1', normalRunnerSaves + 0, 1);        // hybrid layer not invoked

  const hybridRunnerSaves = runnerShouldSelfSave(true) ? 1 : 0;  // suppressed
  eq('hybrid: runner suppressed (0)', hybridRunnerSaves, 0);
  const hybridLayerSaves = 1;                                     // saveHybridWorkout → one doc
  eq('hybrid: total docs = 1', hybridRunnerSaves + hybridLayerSaves, 1);
}

// ── 6. adapter StrengthBlockResult → WorkoutPlan ───────────────────────────
console.log('\n[6] strengthBlockToWorkoutPlan');
{
  const block = {
    exercises: [
      { exercise: { id: 'pushup', content: { name: { he: 'שכיבות סמיכה' } } }, sets: 3, reps: 10, repsRange: { min: 8, max: 12 }, isTimeBased: false, restSeconds: 60 },
      { exercise: { id: 'plank', content: { name: { he: 'פלאנק' } } }, sets: 3, reps: 45, isTimeBased: true, restSeconds: 45 },
    ],
    estimatedDurationSec: 540, totalPlannedSets: 9, isEmpty: false, log: [],
  } as unknown as Parameters<typeof strengthBlockToWorkoutPlan>[0];
  const plan = strengthBlockToWorkoutPlan(block, { name: 'תחנת כוח 1' });
  eq('one segment', plan.segments.length, 1);
  eq('station type', plan.segments[0].type, 'station');
  eq('2 exercises', plan.segments[0].exercises?.length, 2);
  eq('trainingType strength', plan.trainingType, 'strength');
  eq('warmup off (aerobic leg is warmup)', plan.isWarmupActive, false);
  const e0 = plan.segments[0].exercises![0];
  eq('ex0 name localized', e0.name, 'שכיבות סמיכה');
  eq('ex0 sets', e0.sets, 3);
  eq('ex0 reps label', e0.reps, '3×8-12 חזרות');
  eq('ex0 type reps', e0.exerciseType, 'reps');
  const e1 = plan.segments[0].exercises![1];
  eq('ex1 time-based', e1.isTimeBased, true);
  eq('ex1 duration label', e1.duration, '3×45 שניות');
}

// ── 7. park-equipment.util — map + dedupe (injected normalizer) ────────────
console.log('\n[7] parkGymEquipmentToGearIds');
{
  const gym = [
    { equipmentId: 'doc_pullup', brandName: 'Urbanics' },
    { equipmentId: 'doc_dip', brandName: 'Ludos' },
    { equipmentId: 'doc_pullup2', brandName: 'X' }, // normalizes to same canonical → deduped
    { equipmentId: '', brandName: 'Y' },            // empty → dropped
  ] as unknown as Parameters<typeof parkGymEquipmentToGearIds>[0];
  const stub = (ids: string[]) =>
    ids.map((id) => (id.includes('pullup') ? 'pullup_bar' : id.includes('dip') ? 'dip_station' : id));
  const out = parkGymEquipmentToGearIds(gym, stub);
  eq('deduped canonical count', out.length, 2);
  ok('has pullup_bar', out.includes('pullup_bar'));
  ok('has dip_station', out.includes('dip_station'));
  eq('empty gymEquipment → []', parkGymEquipmentToGearIds(undefined, stub).length, 0);
}

console.log(`\n${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} assertions passed`);
if (failures > 0) { console.error(`${failures} FAILED`); process.exit(1); }
process.exit(0);
