import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyIntenseOption } from '../trio-modifiers.service';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Regression found live 01.10.2026 (docs/workout-engine/03-CHANGES.md):
 * applyIntenseOption (Option 3) kept up to MAX_CORE=1 of whatever
 * core-domain exercise was already in `main` unconditionally — no check
 * against userProgramLevels at all. For an unassessed user this preserved
 * a core exercise the rest of the pipeline should never have let through.
 * One contributing, independently-fixable path alongside GuaranteePassRunner's
 * late backstop (promise-validator.test.ts) — the TRUE shared upstream root
 * (how core reaches `main` in the first place) is flagged separately, not
 * fixed here (domain-resolver territory, concurrent work elsewhere).
 */

const rawExercise = (id: string, movementGroup: string, primaryMuscle?: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    primaryMuscle,
    execution_methods: [{ location: 'home', requiredGearType: 'none' }],
    tags: [],
  } as unknown as Exercise);

const workoutExercise = (id: string, movementGroup: string, primaryMuscle?: string): WorkoutExercise =>
  ({
    exercise: rawExercise(id, movementGroup, primaryMuscle),
    method: {},
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    priority: 'compound',
    score: 50,
    reasoning: [],
  } as unknown as WorkoutExercise);

const baseWorkout = (mainExercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 't', description: 'd', exercises: mainExercises,
    estimatedDuration: 45, structure: 'standard', difficulty: 3,
    mechanicalBalance: {} as any, stats: {} as any, isRecovery: false, totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyIntenseOption — core-domain exercises are gated on core assessment', () => {
  it('unassessed user: a core exercise already in main is dropped, not preserved', () => {
    const workout = baseWorkout([
      workoutExercise('push_1', 'vertical_push'),
      workoutExercise('pull_1', 'vertical_pull'),
      workoutExercise('legs_1', 'squat'),
      workoutExercise('core_1', 'core'),
    ]);
    const userProgramLevels = new Map([['push', 8], ['pull', 8], ['legs', 8]]); // no 'core' key
    const allExercises = workout.exercises.map((e) => e.exercise);

    applyIntenseOption(workout, new Set(), userProgramLevels, allExercises, 'home');

    expect(workout.exercises.some((e) => e.exercise.id === 'core_1')).toBe(false);
  });

  it('assessed user: a core exercise already in main is still preserved (unchanged behavior)', () => {
    const workout = baseWorkout([
      workoutExercise('push_1', 'vertical_push'),
      workoutExercise('pull_1', 'vertical_pull'),
      workoutExercise('legs_1', 'squat'),
      workoutExercise('core_1', 'core'),
    ]);
    const userProgramLevels = new Map([['push', 8], ['pull', 8], ['legs', 8], ['core', 8]]);
    const allExercises = workout.exercises.map((e) => e.exercise);

    applyIntenseOption(workout, new Set(), userProgramLevels, allExercises, 'home');

    expect(workout.exercises.some((e) => e.exercise.id === 'core_1')).toBe(true);
  });

  it('unassessed user: primaryMuscle-tagged core/abs exercises are also dropped (isCore covers both signals)', () => {
    const workout = baseWorkout([
      workoutExercise('push_1', 'vertical_push'),
      workoutExercise('pull_1', 'vertical_pull'),
      workoutExercise('legs_1', 'squat'),
      workoutExercise('abs_1', 'other', 'abs'),
    ]);
    const userProgramLevels = new Map([['push', 8], ['pull', 8], ['legs', 8]]);
    const allExercises = workout.exercises.map((e) => e.exercise);

    applyIntenseOption(workout, new Set(), userProgramLevels, allExercises, 'home');

    expect(workout.exercises.some((e) => e.exercise.id === 'abs_1')).toBe(false);
  });
});
