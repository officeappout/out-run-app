import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEssentialGearFilter } from '../trio-modifiers.service';
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
