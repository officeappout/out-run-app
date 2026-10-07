import { describe, it, expect } from 'vitest';
import { prependWarmupExercises } from '../warmup.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

/**
 * Isometric hold-duration safety cap for prependWarmupExercises' main
 * ladder (addToBlock) — see warmup.service.ts's own comment at the fix
 * site for the full root-cause writeup. Uses the Mandatory Legs Guarantee
 * path (same addToBlock call, deterministic single-candidate selection) to
 * exercise the real function without fighting the David-Scale ladder's
 * zone/weight logic for an unrelated assertion.
 */

function homeMethod() {
  return [{ location: 'park', requiredGearType: 'none' }] as any;
}

function makeExercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    execution_methods: homeMethod(),
    ...overrides,
  } as any;
}

function mainSquatExercise(): WorkoutExercise {
  return {
    exercise: makeExercise('main-squat-1', 'סקוואט', { movementGroup: 'squat', mechanicalType: 'bent_arm' }),
    method: homeMethod()[0],
    mechanicalType: 'bent_arm',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 90,
    priority: 'foundation',
    score: 50,
    reasoning: [],
    exerciseRole: 'main',
  } as any;
}

function emptyWorkout(): GeneratedWorkout {
  return {
    title: { he: '', en: '' },
    description: { he: '', en: '' },
    exercises: [mainSquatExercise()] as WorkoutExercise[],
    estimatedDuration: 30,
    structure: 'legs',
    difficulty: 2,
  } as any;
}

const LEGS_10 = new Map<string, number>([['legs', 10]]);

describe('prependWarmupExercises — isometric hold-duration safety cap (Mandatory Legs path)', () => {
  it('a straight-arm, planche-named candidate forced via Mandatory Legs is capped to 15s, not the uncapped 30-45s warmup range', () => {
    // Deliberately unrealistic movementGroup ('squat') for a planche-named
    // straight-arm hold -- the point is to exercise addToBlock's hold-
    // duration cap in isolation via the deterministic Mandatory Legs path,
    // not to model a realistic squat/planche combo.
    const plancheNamedSquatSlot = makeExercise('elite-hold-1', "פלאנץ' בטאק", {
      movementGroup: 'squat',
      mechanicalType: 'straight_arm',
      recommendedLevel: 2, // well within isPotentiationCandidate's zoneMax (domainLevel-4) for any ladder slot
    });
    const workout = emptyWorkout();

    prependWarmupExercises(
      workout, [plancheNamedSquatSlot, mainSquatExercise().exercise], LEGS_10, 'park' as any, ['legs'],
      undefined, 2 as any, [], 30, new Map(),
    );

    const added = workout.exercises.find((ex) => ex.exercise.id === 'elite-hold-1');
    expect(added).toBeDefined();
    expect(added!.isTimeBased).toBe(true);
    expect(added!.reps).toBeLessThanOrEqual(15);
    expect(added!.repsRange).toEqual({ min: 15, max: 15 });
  });

  it('a straight-arm hold with no elite-skill signal still gets the full 30-45s range (cap=45, fix does not over-restrict)', () => {
    const genericStraightArmSquatSlot = makeExercise('generic-hold-1', 'החזקה כללית', {
      movementGroup: 'squat',
      mechanicalType: 'straight_arm',
      targetPrograms: [{ programId: 'legs', level: 2 }],
    });
    const workout = emptyWorkout();

    prependWarmupExercises(
      workout, [genericStraightArmSquatSlot, mainSquatExercise().exercise], LEGS_10, 'park' as any, ['legs'],
      undefined, 2 as any, [], 30, new Map(),
    );

    const added = workout.exercises.find((ex) => ex.exercise.id === 'generic-hold-1');
    expect(added).toBeDefined();
    expect(added!.repsRange).toEqual({ min: 30, max: 45 });
  });
});
