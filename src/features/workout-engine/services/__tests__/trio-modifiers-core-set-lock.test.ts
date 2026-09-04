import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEssentialGearFilter, applyFlowRegression } from '../trio-modifiers.service';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Core set-count lock, second location (docs/workout-engine/05-BENCHMARK.md
 * §3.3 follow-up): applyEssentialGearFilter's "naked" (equipment-free)
 * backfill hardcodes `sets: 3` for every exercise it pulls from the raw
 * global pool to reach MIN_EXERCISES — regardless of domain, entirely
 * outside BudgetDistributor (which owns the equivalent lock for
 * domain-quota-selected exercises — see BudgetDistributor's own
 * CORE_FIXED_SETS / core-set-lock.test.ts). Found by tracing a real
 * "אופניים sets=3" case in a live snapshot (bolt 1 / Flow-Regression,
 * location=home) back to this exact backfill loop, and a second, related
 * gap in its "violation replacement" pass (a domain-mismatched replacement
 * inheriting the wrong sets count via the `...violator` spread).
 */

const rawExercise = (id: string, movementGroup: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    execution_methods: [], // isRawExNaked treats an empty methods array as gear-free
    tags: [],
  } as unknown as Exercise);

const workoutExercise = (id: string, movementGroup: string, sets: number, role: 'main' | 'warmup' | 'cooldown' = 'main'): WorkoutExercise =>
  ({
    exercise: rawExercise(id, movementGroup),
    method: {},
    sets,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: role,
    score: 50,
    reasoning: [],
  } as unknown as WorkoutExercise);

const baseWorkout = (mainExercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 't', description: 'd', exercises: mainExercises,
    estimatedDuration: 20, structure: 'standard', difficulty: 1,
    mechanicalBalance: {} as any, stats: {} as any, isRecovery: false, totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyEssentialGearFilter — naked backfill core set-count lock', () => {
  it('backfills a core-domain candidate at 2 sets, not the generic 3', () => {
    const workout = baseWorkout([]); // 0 main exercises → needs 3 backfilled
    const allExercises = [
      rawExercise('core_1', 'core'),
      rawExercise('pull_1', 'vertical_pull'),
      rawExercise('push_1', 'vertical_push'),
    ];
    applyEssentialGearFilter(workout, new Set(), allExercises, 'home');

    const mains = workout.exercises.filter((e) => e.exerciseRole === 'main');
    expect(mains).toHaveLength(3);
    const core = mains.find((e) => e.exercise.movementGroup === 'core')!;
    const pull = mains.find((e) => e.exercise.movementGroup === 'vertical_pull')!;
    const push = mains.find((e) => e.exercise.movementGroup === 'vertical_push')!;
    expect(core.sets).toBe(2);
    expect(pull.sets).toBe(3);
    expect(push.sets).toBe(3);
  });

  it('location=park/street skips the filter entirely — no backfill, no lock needed (regression guard)', () => {
    const workout = baseWorkout([workoutExercise('existing', 'vertical_pull', 4)]);
    const allExercises = [rawExercise('core_1', 'core')];
    applyEssentialGearFilter(workout, new Set(), allExercises, 'park');
    // Filter returns early for park/street — workout untouched.
    expect(workout.exercises).toHaveLength(1);
    expect(workout.exercises[0].sets).toBe(4);
  });

  it('warmup/cooldown exercises are never touched by the core lock (main-only, matching BudgetDistributor scope)', () => {
    const workout = baseWorkout([
      workoutExercise('warm_core', 'core', 1, 'warmup'),
      workoutExercise('cool_core', 'core', 1, 'cooldown'),
    ]);
    const allExercises = [rawExercise('core_1', 'core'), rawExercise('pull_1', 'vertical_pull'), rawExercise('push_1', 'vertical_push')];
    applyEssentialGearFilter(workout, new Set(), allExercises, 'home');

    const warmup = workout.exercises.find((e) => e.exerciseRole === 'warmup')!;
    const cooldown = workout.exercises.find((e) => e.exerciseRole === 'cooldown')!;
    expect(warmup.sets).toBe(1); // untouched — still its original value
    expect(cooldown.sets).toBe(1);
  });
});

describe('applyEssentialGearFilter — naked backfill isTimeBased consistency (docs/workout-engine/06-TIME-VS-REPS.md)', () => {
  it('a hold-named candidate (e.g. "פלאנק") backfills as time-based with a hold-duration reps value, not the generic 10', () => {
    const workout = baseWorkout([]); // 0 main exercises → needs 3 backfilled
    const allExercises = [
      rawExercise('plank_1', 'core'), // core so it also exercises the sets=2 lock together
      rawExercise('pull_1', 'vertical_pull'),
      rawExercise('push_1', 'vertical_push'),
    ];
    // rawExercise only sets id/name/movementGroup/execution_methods/tags — give
    // this one a hold-keyword name so isTimeBasedExercise's name-heuristic fires.
    allExercises[0] = { ...allExercises[0], name: { he: 'פלאנק', en: 'plank' } } as Exercise;

    applyEssentialGearFilter(workout, new Set(), allExercises, 'home');

    const mains = workout.exercises.filter((e) => e.exerciseRole === 'main');
    const plank = mains.find((e) => e.exercise.id === 'plank_1')!;
    const pull = mains.find((e) => e.exercise.id === 'pull_1')!;
    expect(plank.isTimeBased).toBe(true);
    expect(pull.isTimeBased).toBe(false);
    // Addendum 3 (docs/workout-engine/03-CHANGES.md): reps used to be a flat
    // 20 (time-based) / 10 (rep-based) regardless of tier. Now derived via
    // rederiveVolumeForSwappedExercise — these fixtures have no
    // targetPrograms, so they resolve to delta=0 (match tier): a
    // DIFFICULTY_VOLUME[1] hold range (20-30s) for the plank, and the DAVID
    // STAIRCASE's <50%-progress match range (2-4) for the pull — a range
    // assertion, not an exact value, since assignVolume-derived reps are
    // randomized within their tier's range by design.
    expect(plank.reps).toBeGreaterThanOrEqual(20);
    expect(plank.reps).toBeLessThanOrEqual(30);
    expect(pull.reps).toBeGreaterThanOrEqual(2);
    expect(pull.reps).toBeLessThanOrEqual(4);
  });

  it('a candidate well above the user\'s level backfills with above-level (hard/elite) reps, not a flat default', () => {
    const workout = baseWorkout([]);
    const advanced = { ...rawExercise('adv_1', 'vertical_pull'), targetPrograms: [{ programId: 'pull', level: 15 }] } as Exercise;
    const allExercises = [
      advanced,
      rawExercise('pull_2', 'vertical_pull'),
      rawExercise('push_1', 'vertical_push'),
    ];
    const userProgramLevels = new Map([['pull', 5]]); // delta = 15 - 5 = +10 → elite tier

    applyEssentialGearFilter(workout, new Set(), allExercises, 'home', userProgramLevels);

    const mains = workout.exercises.filter((e) => e.exerciseRole === 'main');
    const adv = mains.find((e) => e.exercise.id === 'adv_1')!;
    expect(adv).toBeDefined();
    // TIER_TABLE elite reps = 1-3, never the old flat 10.
    expect(adv.reps).toBeGreaterThanOrEqual(1);
    expect(adv.reps).toBeLessThanOrEqual(3);
    // Backfilled entries previously never got tier/levelDelta/programLevel/
    // isOverLevel stamped at all (always undefined) — now consistent with
    // every other exercise-identity assignment in the pipeline.
    expect(adv.tier).toBe('elite');
    expect(adv.levelDelta).toBe(10);
    expect(adv.programLevel).toBe(15);
    expect(adv.isOverLevel).toBe(true);
  });
});

describe('applyFlowRegression — exercise-swap isTimeBased consistency (docs/workout-engine/06-TIME-VS-REPS.md)', () => {
  // Real snapshot data: a hold exercise ("החזקת מקבילים...", isTimeBased=true,
  // reps=15 meaning 15 SECONDS) got swapped by the L-2/L-3 regression search to
  // a rep-based replacement ("שכיבות סמיכה ברכיים") while `ex.exercise` was
  // reassigned but `isTimeBased`/`mechanicalType` were left describing the OLD
  // exercise — displaying "15 שניות" for what should read "15 חזרות".
  const timeBasedHold = (id: string, level: number): Exercise =>
    ({
      id, name: { he: id, en: id }, primaryMuscle: 'chest',
      mechanicalType: 'straight_arm', // isTimeBasedExercise => true regardless of type
      targetPrograms: [{ programId: 'push', level }],
      execution_methods: [],
    } as unknown as Exercise);

  const repBasedCandidate = (id: string, level: number): Exercise =>
    ({
      id, name: { he: id, en: id }, primaryMuscle: 'chest',
      mechanicalType: 'bent_arm',
      targetPrograms: [{ programId: 'push', level }],
      execution_methods: [],
    } as unknown as Exercise);

  it('swapping to a rep-based replacement clears isTimeBased and re-derives mechanicalType — not left describing the pre-swap exercise', () => {
    const victim = timeBasedHold('hold_L8', 8);
    const replacement = repBasedCandidate('reps_L7', 7);

    const workout: GeneratedWorkout = {
      exercises: [
        {
          exercise: victim,
          method: {},
          mechanicalType: 'straight_arm',
          isTimeBased: true, // pre-swap state — must NOT survive the swap
          sets: 3,
          reps: 15,
          restSeconds: 60,
          exerciseRole: 'main',
          score: 50,
          reasoning: [],
          // Deliberately stale/wrong pre-swap metadata (a plausible value
          // for a DIFFERENT tier) to prove these get overwritten, not just
          // reps/isTimeBased. This is the second-order bug found while
          // verifying: reps could be correctly re-derived while tier/
          // levelDelta/programLevel/isOverLevel kept describing the
          // pre-swap exercise.
          tier: 'match',
          levelDelta: 0,
          programLevel: 8,
          isOverLevel: false,
        } as unknown as WorkoutExercise,
      ],
    } as unknown as GeneratedWorkout;

    applyFlowRegression(
      workout,
      new Map([['push', 3]]), // user is push L3 — victim (L8) and replacement (L7) both stay well above the user even after regression, same as the real bolt-1 bug's dominant pattern
      [victim, replacement],
      new Set(),
      'home',
      'push',
    );

    const swapped = workout.exercises[0];
    expect(swapped.exercise.id).toBe('reps_L7'); // the swap did happen
    expect(swapped.isTimeBased).toBe(false); // re-derived for the NEW exercise, not stale `true`
    expect(swapped.mechanicalType).toBe('bent_arm');
    expect(swapped.reasoning.some((r) => r.startsWith('flow_regression:'))).toBe(true);
    // The exact bug: pre-swap reps was 15 (a HOLD DURATION in seconds).
    // Replacement (L7) is delta=+4 above the user (L3) → elite tier →
    // TIER_TABLE reps 1-3. Must NOT still be 15.
    expect(swapped.reps).not.toBe(15);
    expect(swapped.reps).toBeGreaterThanOrEqual(1);
    expect(swapped.reps).toBeLessThanOrEqual(3);
    // Metadata sync: must reflect the REPLACEMENT's true delta, not the
    // stale pre-swap values seeded above.
    expect(swapped.tier).toBe('elite');
    expect(swapped.levelDelta).toBe(4);
    expect(swapped.programLevel).toBe(7);
    expect(swapped.isOverLevel).toBe(true);
  });

  it('swapping to ANOTHER time-based replacement correctly stays isTimeBased=true (not a blanket false)', () => {
    const victim = timeBasedHold('hold_L8b', 8);
    const replacement = timeBasedHold('hold_L7', 7); // also straight_arm — still time-based

    const workout: GeneratedWorkout = {
      exercises: [
        {
          exercise: victim, method: {}, mechanicalType: 'straight_arm',
          isTimeBased: true, sets: 3, reps: 15, restSeconds: 60,
          exerciseRole: 'main', score: 50, reasoning: [],
        } as unknown as WorkoutExercise,
      ],
    } as unknown as GeneratedWorkout;

    applyFlowRegression(workout, new Map([['push', 10]]), [victim, replacement], new Set(), 'home', 'push');

    const swapped = workout.exercises[0];
    expect(swapped.exercise.id).toBe('hold_L7');
    expect(swapped.isTimeBased).toBe(true);
    expect(swapped.mechanicalType).toBe('straight_arm');
  });
});
