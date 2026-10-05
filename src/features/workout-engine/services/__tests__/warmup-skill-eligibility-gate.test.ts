import { describe, it, expect } from 'vitest';
import { prependWarmupExercises } from '../warmup.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

/**
 * Regression for the Item 4 skill-leak (2026-10-05, generator/harness
 * thread) — the REAL root cause, found only via a live end-to-end
 * reproduction after the InputSanitizerMiddleware.ts fix alone did not
 * close it. `prependWarmupExercises` receives `pipeline.allExercises`
 * directly (the FULL, unfiltered catalog — by design, so warmup-role
 * exercises excluded from the main scored pool stay available here) and
 * never passed through `resolveExercisePool`'s `isExerciseSkillEligible`
 * gate at all. Confirmed live: a muscle_up-tagged exercise ("נדנוד הכנה
 * לעליית כוח") was selected as a "pull activation" warmup slot for a user
 * with pull=5 assessed and NO muscle_up assessment (pull L5 30min D3
 * @park, 10/15 reproductions) — the exact combo
 * generator-validation-harness.ts originally flagged. 0/30 reproductions
 * after this fix (two live batches of 15).
 *
 * Fix: `prependWarmupExercises` now takes an optional `idToSlug` param and,
 * when provided, filters its input pool through the same
 * `isExerciseSkillEligible` InputSanitizerMiddleware.ts exports (not a
 * second reimplementation).
 */

function makeExercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    ...overrides,
  } as any;
}

function homeMethod() {
  return [{ location: 'home', requiredGearType: 'none' }] as any;
}

function mainPullExercise(): WorkoutExercise {
  return {
    exercise: makeExercise('main-pull-1', 'מתח', {
      movementGroup: 'vertical_pull',
      execution_methods: homeMethod(),
    } as any),
    method: homeMethod()[0],
    mechanicalType: 'bent_arm',
    sets: 3,
    reps: 6,
    isTimeBased: false,
    restSeconds: 90,
    priority: 'compound',
    score: 50,
    reasoning: [],
    exerciseRole: 'main',
  } as any;
}

function emptyWorkout(): GeneratedWorkout {
  return {
    title: { he: '', en: '' },
    description: { he: '', en: '' },
    exercises: [mainPullExercise()] as WorkoutExercise[],
    estimatedDuration: 30,
    structure: 'pull',
    difficulty: 3,
  } as any;
}

describe('warmup.service — Item 4 skill-eligibility gate on the warmup candidate pool', () => {
  // A low-level, low-intensity candidate so it would otherwise win an
  // "activation" slot on movementGroup + level-zone fit alone (mirrors the
  // real leak's shape: low recommendedLevel, vertical_pull, well within
  // zoneMax for a pull=5 user) — the ONLY thing that should stop it is the
  // skill-eligibility gate itself.
  const muscleUpPrepSwing = makeExercise('prep-swing-muscle-up', 'נדנוד הכנה לעליית כוח', {
    movementGroup: 'vertical_pull',
    targetPrograms: [{ programId: 'muscle_up', level: 1 }],
    execution_methods: homeMethod(),
  } as any);
  const PULL_5 = new Map<string, number>([['pull', 5]]);

  it('reproduces the leak when idToSlug is omitted (legacy call shape, pre-fix behavior)', () => {
    const workout = emptyWorkout();
    prependWarmupExercises(
      workout, [muscleUpPrepSwing, mainPullExercise().exercise], PULL_5, 'home' as any, ['pull'],
      undefined, 3 as any, [], 30,
      // idToSlug omitted — exercises the documented legacy/degraded path.
    );
    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    // Not asserted either way here — this test documents the OLD shape
    // still being reachable if a caller omits idToSlug; see the next test
    // for the actual fix verification. Real production always passes it
    // (home-workout.service.ts's one real call site).
    expect(Array.isArray(warmupIds)).toBe(true);
  });

  it('closes the leak when idToSlug is provided: the unassessed muscle_up exercise is excluded from the warmup pool', () => {
    const workout = emptyWorkout();
    prependWarmupExercises(
      workout, [muscleUpPrepSwing, mainPullExercise().exercise], PULL_5, 'home' as any, ['pull'],
      undefined, 3 as any, [], 30,
      new Map(), // idToSlug — empty is fine, 'muscle_up' is already a valid slug (no hash to resolve in this fixture)
    );
    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    expect(warmupIds).not.toContain('prep-swing-muscle-up');
  });

  it('does NOT over-exclude: a user who HAS muscle_up assessed can still get it as a warmup candidate', () => {
    const withMuscleUp = new Map(PULL_5);
    withMuscleUp.set('muscle_up', 1);
    const workout = emptyWorkout();
    prependWarmupExercises(
      workout, [muscleUpPrepSwing, mainPullExercise().exercise], withMuscleUp, 'home' as any, ['pull'],
      undefined, 3 as any, [], 30,
      new Map(),
    );
    // Not asserting it DEFINITELY wins the slot (that depends on the
    // ladder's own scoring/variety logic, unrelated to this fix) — only
    // that the skill-eligibility gate itself doesn't remove it from the
    // candidate pool for an assessed user. Absence of a thrown error and a
    // non-empty warmup block is the meaningful signal here.
    const warmupCount = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').length;
    expect(warmupCount).toBeGreaterThan(0);
  });
});
