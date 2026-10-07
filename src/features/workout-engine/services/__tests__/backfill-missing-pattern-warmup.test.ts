import { describe, it, expect } from 'vitest';
import { backfillMissingPatternWarmup } from '../warmup.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

/**
 * Regression coverage for the late push/pull warmup-coverage backfill
 * (2026-10-07) — generalizes the Mandatory Legs Guarantee (same file) to
 * push/pull, called from a LATER point in the pipeline (after
 * enforceVolumeCap's Phase D reserve top-up and runSkillRepresentationGuarantee)
 * so it sees the true final main-exercise list, not the early snapshot
 * prependWarmupExercises itself had to use. See the function's own doc
 * comment in warmup.service.ts for the full root-cause writeup.
 */

function homeMethod() {
  return [{ location: 'park', requiredGearType: 'none' }] as any;
}

function makeExercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    execution_methods: homeMethod(),
    recommendedLevel: 3,
    ...overrides,
  } as any;
}

function mainExerciseFor(id: string, movementGroup: string, targetPrograms: Array<{ programId: string; level: number }> = []): WorkoutExercise {
  return {
    exercise: makeExercise(id, id, { movementGroup, targetPrograms } as any),
    method: homeMethod()[0],
    mechanicalType: 'bent_arm',
    sets: 3,
    reps: 6,
    isTimeBased: false,
    restSeconds: 90,
    priority: 'skill',
    score: 50,
    reasoning: [],
    exerciseRole: 'main',
  } as any;
}

function warmupExerciseFor(id: string, movementGroup: string): WorkoutExercise {
  return {
    exercise: makeExercise(id, id, { movementGroup } as any),
    method: homeMethod()[0],
    mechanicalType: 'bent_arm',
    sets: 1,
    reps: 10,
    isTimeBased: false,
    restSeconds: 15,
    priority: 'accessory',
    score: 0,
    reasoning: ['warmup'],
    exerciseRole: 'warmup',
  } as any;
}

function workoutWith(exercises: WorkoutExercise[]): GeneratedWorkout {
  return {
    title: { he: '', en: '' },
    description: { he: '', en: '' },
    exercises,
    estimatedDuration: 20,
    structure: 'calisthenics_upper',
    difficulty: 2,
  } as any;
}

const PLANCHE_FRONT_LEVELS = new Map<string, number>([
  ['planche', 14], ['front_lever', 7], ['push', 23], ['pull', 16],
]);

describe('backfillMissingPatternWarmup — generalizes Mandatory Legs Guarantee to push/pull', () => {
  it('main trains both push and pull but warmup only covers pull -> adds a push slot', () => {
    const pushCandidate = makeExercise('push-cand', 'push candidate', {
      movementGroup: 'horizontal_push', recommendedLevel: 3,
    });
    const workout = workoutWith([
      warmupExerciseFor('warmup-pull-1', 'vertical_pull'),
      mainExerciseFor('main-planche', 'horizontal_push', [{ programId: 'planche', level: 14 }]),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    backfillMissingPatternWarmup(
      workout, [pushCandidate], PLANCHE_FRONT_LEVELS, ['planche', 'front_lever'], 'park', [], 30,
    );

    const warmups = workout.exercises.filter((ex) => ex.exerciseRole === 'warmup');
    expect(warmups).toHaveLength(2);
    expect(warmups.some((w) => w.exercise.id === 'push-cand')).toBe(true);
  });

  it('main trains pull only, warmup already covers pull -> no-op, nothing added', () => {
    const pushCandidate = makeExercise('push-cand', 'push candidate', { movementGroup: 'horizontal_push' });
    const workout = workoutWith([
      warmupExerciseFor('warmup-pull-1', 'vertical_pull'),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    backfillMissingPatternWarmup(
      workout, [pushCandidate], PLANCHE_FRONT_LEVELS, ['front_lever'], 'park', [], 30,
    );

    expect(workout.exercises.filter((ex) => ex.exerciseRole === 'warmup')).toHaveLength(1);
  });

  it('legs is never added by this function, even if main trains legs and warmup misses it', () => {
    const squatCandidate = makeExercise('squat-cand', 'squat candidate', { movementGroup: 'squat' });
    const workout = workoutWith([
      warmupExerciseFor('warmup-pull-1', 'vertical_pull'),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
      mainExerciseFor('main-legs', 'squat'),
    ]);

    backfillMissingPatternWarmup(
      workout, [squatCandidate], PLANCHE_FRONT_LEVELS, ['front_lever'], 'park', [], 30,
    );

    // legs stays uncovered by THIS function -- it's the Mandatory Legs
    // Guarantee's job, at its own (earlier) position.
    expect(workout.exercises.some((ex) => ex.exercise.id === 'squat-cand')).toBe(false);
  });

  it('warmup slot budget already full (30min -> 3 slots) -> skips the backfill entirely', () => {
    const pushCandidate = makeExercise('push-cand', 'push candidate', { movementGroup: 'horizontal_push' });
    const workout = workoutWith([
      warmupExerciseFor('warmup-1', 'vertical_pull'),
      warmupExerciseFor('warmup-2', 'vertical_pull'),
      warmupExerciseFor('warmup-3', 'vertical_pull'),
      mainExerciseFor('main-planche', 'horizontal_push', [{ programId: 'planche', level: 14 }]),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    backfillMissingPatternWarmup(
      workout, [pushCandidate], PLANCHE_FRONT_LEVELS, ['planche', 'front_lever'], 'park', [], 30,
    );

    expect(workout.exercises.filter((ex) => ex.exerciseRole === 'warmup')).toHaveLength(3);
  });

  it('no candidate exists for the missing pattern -> no crash, no addition', () => {
    const workout = workoutWith([
      warmupExerciseFor('warmup-pull-1', 'vertical_pull'),
      mainExerciseFor('main-planche', 'horizontal_push', [{ programId: 'planche', level: 14 }]),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    expect(() => backfillMissingPatternWarmup(
      workout, [], PLANCHE_FRONT_LEVELS, ['planche', 'front_lever'], 'park', [], 30,
    )).not.toThrow();
    expect(workout.exercises.filter((ex) => ex.exerciseRole === 'warmup')).toHaveLength(1);
  });

  it('empty main-exercise list (e.g. empty-pool fallback) -> no-op', () => {
    const pushCandidate = makeExercise('push-cand', 'push candidate', { movementGroup: 'horizontal_push' });
    const workout = workoutWith([]);

    expect(() => backfillMissingPatternWarmup(
      workout, [pushCandidate], new Map(), [], 'park', [], 30,
    )).not.toThrow();
    expect(workout.exercises).toHaveLength(0);
  });

  // ── Isometric hold-duration safety cap (2026-10-07) ─────────────────────
  // See warmup.service.ts's own comment at the fix site for the full
  // root-cause writeup: WARMUP_HOLD_SECONDS (30-45s) had no mechanicalType/
  // elite-skill check at all, so a straight-arm lever hold could be
  // prescribed up to 45s here -- three times the 15s ceiling the SAME
  // position gets as a main exercise. Fixed by reusing getIsometricTimeCap.
  it('a straight-arm planche-named candidate is capped to 15s in warmup (was up to 45s before this fix)', () => {
    // mechanicalType:'straight_arm' makes isTimeBasedExercise() return true
    // unconditionally. The Hebrew name "פלאנץ'" hits getIsometricTimeCap's
    // elite-skill name heuristic -> cap=15, regardless of level.
    const plancheHold = makeExercise('planche-hold-1', "פלאנץ' בטאק", {
      movementGroup: 'horizontal_push',
      mechanicalType: 'straight_arm',
    });
    const workout = workoutWith([
      mainExerciseFor('main-planche', 'horizontal_push', [{ programId: 'planche', level: 14 }]),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    backfillMissingPatternWarmup(
      workout, [plancheHold], PLANCHE_FRONT_LEVELS, ['planche', 'front_lever'], 'park', [], 30,
    );

    const added = workout.exercises.find((ex) => ex.exercise.id === 'planche-hold-1');
    expect(added).toBeDefined();
    expect(added!.isTimeBased).toBe(true);
    expect(added!.reps).toBeLessThanOrEqual(15);
    expect(added!.repsRange).toEqual({ min: 15, max: 15 });
  });

  it('a straight-arm hold with no elite-skill signal keeps the original 30-45s warmup range (cap=45, not over-restricted)', () => {
    // Deliberately generic name/movementGroup/level so none of
    // getIsometricTimeCap's heuristics fire -> falls through to its Tier-3
    // default (45s) -- same as WARMUP_HOLD_SECONDS.max already was, so this
    // fix must not narrow a genuinely-45s-safe case.
    const genericHold = makeExercise('generic-hold-1', 'החזקה כללית', {
      movementGroup: 'horizontal_push',
      mechanicalType: 'straight_arm',
      recommendedLevel: 2,
      targetPrograms: [{ programId: 'push', level: 2 }],
    });
    const workout = workoutWith([
      mainExerciseFor('main-planche', 'horizontal_push', [{ programId: 'planche', level: 14 }]),
      mainExerciseFor('main-front', 'horizontal_pull', [{ programId: 'front_lever', level: 7 }]),
    ]);

    backfillMissingPatternWarmup(
      workout, [genericHold], PLANCHE_FRONT_LEVELS, ['planche', 'front_lever'], 'park', [], 30,
    );

    const added = workout.exercises.find((ex) => ex.exercise.id === 'generic-hold-1');
    expect(added).toBeDefined();
    expect(added!.repsRange).toEqual({ min: 30, max: 45 });
  });
});
