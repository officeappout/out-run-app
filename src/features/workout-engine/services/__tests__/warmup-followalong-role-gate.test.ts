import { describe, it, expect } from 'vitest';
import { prependWarmupExercises } from '../warmup.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

/**
 * Regression for the follow-along/exerciseRole leak found alongside
 * docs/workout-engine/09-CORE-TABATA.md's core-block work (05.09.2026):
 * warmup.service.ts's general-mobility slot (Stage 1, ~line 609) selected
 * ANY `isFollowAlong===true` exercise regardless of `exerciseRole` — a
 * comment even claimed this was deliberate ("distinguisher is isFollowAlong,
 * NOT exerciseRole"). Live data disproved that: every isFollowAlong exercise
 * in the catalog already carries a real exerciseRole. Measured live impact
 * in a 3,780-workout snapshot: ~28% of workouts got one of the 4 core-tabata
 * follow-along ladder items (exerciseRole:'reinforcement') as their WARMUP
 * exercise instead of a real warmup guide; the 7 full recovery-session
 * videos (exerciseRole:'recovery') were equally eligible via the same gap.
 *
 * Fix: both the primary filter (line 609) and the emergency fallback (line
 * 637) now require exerciseRole==='warmup' in addition to isFollowAlong.
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

// prependWarmupExercises early-returns when there are no main exercises
// (mainExercises.length === 0) — every test needs at least one so Part A
// actually runs.
function dummyMainExercise(): WorkoutExercise {
  return {
    exercise: makeExercise('main-1', 'main exercise', {
      movementGroup: 'vertical_push',
      execution_methods: homeMethod(),
    } as any),
    method: homeMethod()[0],
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 60,
    priority: 'compound',
    score: 10,
    reasoning: [],
    exerciseRole: 'main',
  } as any;
}

function emptyWorkout(): GeneratedWorkout {
  return {
    title: { he: '', en: '' },
    description: { he: '', en: '' },
    exercises: [dummyMainExercise()] as WorkoutExercise[],
    estimatedDuration: 20,
    structure: 'push',
    difficulty: 2,
  } as any;
}

describe('warmup.service — follow-along general-mobility slot exerciseRole gate', () => {
  it('does NOT select a core-tabata follow-along item (exerciseRole:reinforcement) for the warmup slot', () => {
    const coreFollowAlong = makeExercise('core-fa-1', 'טבטה', {
      isFollowAlong: true,
      exerciseRole: 'reinforcement',
      execution_methods: homeMethod(),
    } as any);
    const workout = emptyWorkout();

    prependWarmupExercises(
      workout,
      [coreFollowAlong],
      new Map(), // empty userProgramLevels → maxUserLevel=1 → Part B (potentiation) skipped
      'home' as any,
      [],
      undefined,
      2 as any,
      [],
      20,
    );

    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    expect(warmupIds).not.toContain('core-fa-1');
  });

  it('does NOT select a recovery-session follow-along item (exerciseRole:recovery) for the warmup slot', () => {
    const recoveryFollowAlong = makeExercise('recovery-fa-1', 'סשן התאוששות', {
      isFollowAlong: true,
      exerciseRole: 'recovery',
      execution_methods: homeMethod(),
    } as any);
    const workout = emptyWorkout();

    prependWarmupExercises(
      workout,
      [recoveryFollowAlong],
      new Map(),
      'home' as any,
      [],
      undefined,
      2 as any,
      [],
      20,
    );

    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    expect(warmupIds).not.toContain('recovery-fa-1');
  });

  it('DOES select a real warmup-role follow-along guide for the slot', () => {
    const realWarmupFollowAlong = makeExercise('warmup-fa-1', 'חימום כללי', {
      isFollowAlong: true,
      exerciseRole: 'warmup',
      execution_methods: homeMethod(),
    } as any);
    const workout = emptyWorkout();

    prependWarmupExercises(
      workout,
      [realWarmupFollowAlong],
      new Map(),
      'home' as any,
      [],
      undefined,
      2 as any,
      [],
      20,
    );

    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    expect(warmupIds).toContain('warmup-fa-1');
  });

  it('emergency fallback (no location match) also stays scoped to exerciseRole:warmup', () => {
    const coreFollowAlongWrongLocation = makeExercise('core-fa-2', 'טבטה מאתגר', {
      isFollowAlong: true,
      exerciseRole: 'reinforcement',
      execution_methods: [{ location: 'park', requiredGearType: 'none' }] as any,
    } as any);
    const workout = emptyWorkout();

    // Requesting 'home' while the only isFollowAlong candidate is park-tagged and
    // reinforcement-role — must not fall back to it just because nothing else matched.
    prependWarmupExercises(
      workout,
      [coreFollowAlongWrongLocation],
      new Map(),
      'home' as any,
      [],
      undefined,
      2 as any,
      [],
      20,
    );

    const warmupIds = workout.exercises.filter(ex => ex.exerciseRole === 'warmup').map(ex => ex.exercise.id);
    expect(warmupIds).not.toContain('core-fa-2');
  });
});
