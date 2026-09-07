import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyFlowRegression } from '../trio-modifiers.service';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * 03-CHANGES.md Addendum 28 (07.09.2026, David's fix): applyFlowRegression's
 * regression-swap search matched candidates by `primaryMuscle` alone — no
 * movementGroup/domain check at all. A pull exercise and a push exercise can
 * legitimately share a primaryMuscle tag (e.g. shoulders, hit by both a
 * horizontal row and a pike hold), so the "find an easier variant" search
 * could silently regress a pull slot into a push exercise.
 *
 * Live-traced (not guessed): reproduced in 5/6 D1/L10 runs with the exact
 * pair "משיכות Y" (horizontal_pull) → "עמידת פייק" (vertical_push), same
 * array position, mid swap-loop. Fixed by matching on `movementGroup`
 * instead — a pull exercise can now only ever be replaced by another pull
 * exercise (same movementGroup), regardless of shared primaryMuscle.
 */

const rawExercise = (
  id: string,
  movementGroup: string,
  primaryMuscle: string,
  level: number,
  programId: string,
): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    primaryMuscle,
    targetPrograms: [{ programId, level }],
    execution_methods: [{ location: 'home', gearId: 'none' }],
    tags: [],
  } as unknown as Exercise);

const workoutExercise = (exercise: Exercise): WorkoutExercise =>
  ({
    exercise,
    method: { gearId: 'none' },
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    score: 50,
    reasoning: [],
  } as unknown as WorkoutExercise);

const baseWorkout = (mainExercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 't', description: 'd', exercises: mainExercises,
    estimatedDuration: 20, structure: 'standard', difficulty: 2,
    mechanicalBalance: {} as any, stats: {} as any, isRecovery: false, totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyFlowRegression swap search — never crosses domain via a shared primaryMuscle', () => {
  // MIN_EXERCISES (applyEssentialGearFilter, called internally at the end of
  // applyFlowRegression) backfills up to 3 main exercises — pad with 2
  // naked, domain-irrelevant fillers so the backfill never fires and these
  // tests isolate the swap-search mechanism specifically.
  const filler = () => [
    workoutExercise(rawExercise('legs-filler-1', 'squat', 'quads', 5, 'legs')),
    workoutExercise(rawExercise('legs-filler-2', 'squat', 'quads', 5, 'legs')),
  ];

  it('the exact repro: a horizontal_pull exercise regresses to another pull exercise, never to a push exercise sharing its primaryMuscle', () => {
    const pullY = rawExercise('pull-Y', 'horizontal_pull', 'shoulders', 8, 'pull');
    // Bad candidate: same primaryMuscle as pullY, same qualifying level, but
    // a PUSH exercise — this is exactly what the pre-fix code picked.
    // Placed FIRST in allExercises so `.find()` would hit it first under the
    // old primaryMuscle-only predicate.
    const pikeHold = rawExercise('push-pike', 'vertical_push', 'shoulders', 7, 'push');
    // Good candidate: correct domain (pull), but a DIFFERENT primaryMuscle —
    // proves the fix matches on movementGroup, not primaryMuscle at all.
    const pullEasy = rawExercise('pull-easy', 'horizontal_pull', 'back', 7, 'pull');

    const workout = baseWorkout([workoutExercise(pullY), ...filler()]);
    const userProgramLevels = new Map([['push', 8], ['pull', 8]]);

    applyFlowRegression(workout, userProgramLevels, [pikeHold, pullEasy], new Set(), 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    const pullSlot = mains.find(e => e.exercise.id === 'pull-Y' || e.exercise.id === 'pull-easy' || e.exercise.id === 'push-pike');
    expect(pullSlot).toBeDefined();
    expect(pullSlot!.exercise.id).toBe('pull-easy');
    expect(pullSlot!.exercise.movementGroup).toBe('horizontal_pull');
    expect(mains.some(e => e.exercise.id === 'push-pike')).toBe(false);
  });

  it('falls back to flow_no_swap (keeps the original) when no same-movementGroup replacement exists, instead of crossing domains', () => {
    const pullY = rawExercise('pull-Y', 'horizontal_pull', 'shoulders', 8, 'pull');
    // Only a same-primaryMuscle PUSH candidate is available — no pull candidate at all.
    const pikeHold = rawExercise('push-pike', 'vertical_push', 'shoulders', 7, 'push');

    const workout = baseWorkout([workoutExercise(pullY), ...filler()]);
    const userProgramLevels = new Map([['push', 8], ['pull', 8]]);

    applyFlowRegression(workout, userProgramLevels, [pikeHold], new Set(), 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    const pullSlot = mains.find(e => e.exercise.id === 'pull-Y' || e.exercise.id === 'push-pike');
    expect(pullSlot).toBeDefined();
    expect(pullSlot!.exercise.id).toBe('pull-Y'); // unchanged — never swapped to push-pike
    expect(pullSlot!.reasoning.some(r => r.startsWith('flow_no_swap'))).toBe(true);
  });
});
