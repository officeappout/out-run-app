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
    expect(plank.reps).toBe(20); // hold-duration default, not the generic reps:10
    expect(pull.isTimeBased).toBe(false);
    expect(pull.reps).toBe(10);
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
        } as unknown as WorkoutExercise,
      ],
    } as unknown as GeneratedWorkout;

    applyFlowRegression(
      workout,
      new Map([['push', 10]]),
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
