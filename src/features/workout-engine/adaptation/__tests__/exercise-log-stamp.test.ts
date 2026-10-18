import { describe, it, expect } from 'vitest';
import {
  adaptationStampForPlan,
  deriveCoachHint,
  inferRepsSource,
  logStampFromPlanExercise,
  recordSetMeta,
  swapStampForEntry,
  type SetMetaCarrier,
} from '../exercise-log-stamp';
import { toSegmentExerciseDetail } from '@/features/workout-engine/core/services/storage.service';
import type { ExerciseResultLog } from '@/features/workout-engine/players/strength/hooks/useWorkoutStateMachine';

describe('adaptationStampForPlan (generator entry → runner plan exercise)', () => {
  it('stamps domain, levels from an unswapped entry', () => {
    expect(
      adaptationStampForPlan({
        exercise: { id: 'pu', movementGroup: 'horizontal_push' },
        programLevel: 6,
        levelDelta: 1,
      }),
    ).toEqual({ domain: 'push', exerciseLevel: 6, userDomainLevel: 5 });
  });

  it('does not guess userDomainLevel for a swapped entry without an explicit one', () => {
    const s = adaptationStampForPlan({
      exercise: { id: 'kpu', movementGroup: 'horizontal_push' },
      programLevel: 3,
      levelDelta: 1, // stale — deriveSwappedEntry keeps the old levelDelta
      wasSwapped: true,
      swappedFromId: 'pu',
    });
    expect(s).toEqual({ domain: 'push', exerciseLevel: 3, wasSwapped: true, swappedFromId: 'pu' });
  });

  it('prefers swappedToLevel / userDomainLevel when a swap path stamped them', () => {
    expect(
      adaptationStampForPlan({
        exercise: { id: 'kpu', movementGroup: 'squat' },
        programLevel: 6,
        wasSwapped: true,
        swappedToLevel: 4,
        userDomainLevel: 6,
      }),
    ).toMatchObject({ domain: 'legs', exerciseLevel: 4, userDomainLevel: 6 });
  });

  it('omits keys it cannot know (no undefined values)', () => {
    const s = adaptationStampForPlan({ exercise: { id: 'x', movementGroup: 'mobility_whatever' } });
    expect(s).toEqual({});
  });
});

describe('swapStampForEntry', () => {
  it('keeps the ORIGINAL exercise across repeated swaps', () => {
    const first = swapStampForEntry({ exercise: { id: 'A' }, programLevel: 5, levelDelta: 0 }, 'B', 4);
    expect(first).toEqual({ swappedFromId: 'A', userDomainLevel: 5, swappedToLevel: 4 });
    const second = swapStampForEntry(
      { exercise: { id: 'B' }, programLevel: 4, levelDelta: 0, wasSwapped: true, ...first },
      'C',
    );
    expect(second.swappedFromId).toBe('A');
    expect(second.userDomainLevel).toBe(5);
  });

  it('a same-exercise method swap is not an exercise swap', () => {
    expect(swapStampForEntry({ exercise: { id: 'A' }, programLevel: 5, levelDelta: 0 }, 'A')).toEqual({});
  });
});

describe('logStampFromPlanExercise (plan exercise → log entry)', () => {
  it('copies the plan context', () => {
    expect(
      logStampFromPlanExercise({
        id: 'kpu',
        exerciseRole: 'main',
        repsRange: { min: 8, max: 12 },
        domain: 'push',
        exerciseLevel: 3,
        userDomainLevel: 5,
        wasSwapped: true,
        swappedFromId: 'pu',
      }),
    ).toEqual({
      domain: 'push',
      exerciseLevel: 3,
      userDomainLevel: 5,
      prescribedRange: { min: 8, max: 12 },
      role: 'main',
      wasSwapped: true,
      swappedFromId: 'pu',
    });
  });

  it('returns {} for a legacy plan exercise', () => {
    expect(logStampFromPlanExercise({ id: 'x' })).toEqual({});
    expect(logStampFromPlanExercise(null)).toEqual({});
  });
});

describe('repsSource / coachHints stamping', () => {
  it('inferRepsSource: the prescribed target is a default, anything else was edited', () => {
    expect(inferRepsSource(10, 10)).toBe('default');
    expect(inferRepsSource(8, 10)).toBe('edited');
    expect(inferRepsSource(8, null)).toBe('edited');
  });

  it('deriveCoachHint mirrors the drawer comparison (reps only)', () => {
    expect(deriveCoachHint(5, 8, 12, 'reps')).toBe('fail');
    expect(deriveCoachHint(15, 8, 12, 'reps')).toBe('overachieve');
    expect(deriveCoachHint(10, 8, 12, 'reps')).toBeNull();
    expect(deriveCoachHint(5, 8, 12, 'time')).toBeNull();
    expect(deriveCoachHint(5, null, null, 'reps')).toBeNull();
  });

  it('records per-set provenance parallel to confirmedReps', () => {
    const e: SetMetaCarrier = { confirmedReps: [10] };
    recordSetMeta(e, 0, 'default', null);
    e.confirmedReps.push(6);
    recordSetMeta(e, 1, 'edited', 'fail');
    expect(e.repsSource).toEqual(['default', 'edited']);
    expect(e.coachHints).toEqual(['none', 'fail']);
  });

  it('a re-edit overwrites only that set', () => {
    const e: SetMetaCarrier = { confirmedReps: [10, 10], repsSource: ['default', 'default'], coachHints: ['none', 'none'] };
    e.confirmedReps[0] = 7;
    recordSetMeta(e, 0, 'edited', 'fail');
    expect(e.repsSource).toEqual(['edited', 'default']);
    expect(e.coachHints).toEqual(['fail', 'none']);
  });

  it('pads entries restored from an older checkpoint that had no arrays', () => {
    const e: SetMetaCarrier = { confirmedReps: [10, 10, 9] };
    recordSetMeta(e, 2, 'timer', null);
    expect(e.repsSource).toEqual(['default', 'default', 'timer']);
    expect(e.coachHints).toEqual(['none', 'none', 'none']);
  });
});

describe('toSegmentExerciseDetail carries the Phase 0 fields', () => {
  it('maps them conditionally and stays backwards compatible', () => {
    const legacy: ExerciseResultLog = {
      exerciseId: 'a', exerciseName: 'A', segmentId: 's', confirmedReps: [10], targetReps: 10,
    };
    expect(toSegmentExerciseDetail([legacy])).toEqual([
      { exerciseId: 'a', exerciseName: 'A', confirmedReps: [10], targetReps: 10 },
    ]);

    const stamped: ExerciseResultLog = {
      ...legacy,
      confirmedReps: [10, 7],
      domain: 'push',
      exerciseLevel: 4,
      userDomainLevel: 5,
      prescribedRange: { min: 8, max: 12 },
      role: 'main',
      wasSwapped: true,
      swappedFromId: 'orig',
      repsSource: ['default', 'edited'],
      coachHints: ['none', 'fail'],
    };
    const [d] = toSegmentExerciseDetail([stamped]);
    expect(d).toMatchObject({
      domain: 'push',
      exerciseLevel: 4,
      userDomainLevel: 5,
      prescribedRange: { min: 8, max: 12 },
      role: 'main',
      wasSwapped: true,
      swappedFromId: 'orig',
      repsSource: ['default', 'edited'],
      coachHints: ['none', 'fail'],
    });
    // never an undefined value (Firestore rejects undefined in array elements)
    for (const v of Object.values(d)) expect(v).not.toBeUndefined();
  });
});
