import { describe, it, expect } from 'vitest';
import {
  mergeUpdates,
  safeKey,
  swapToStatsUpdates,
  toNestedPatch,
  workoutToStatsUpdates,
} from '../exercise-stats';

const swap = {
  userId: 'u1',
  fromExerciseId: 'pu',
  fromName: 'שכיבות סמיכה',
  toExerciseId: 'kpu',
  toName: 'שכיבות על הברכיים',
  domain: 'push',
  fromLevel: 5,
  toLevel: 3,
  direction: 'lower',
  tab: 'adaptation',
  source: 'in_workout_coach_hint',
  userInitiated: true,
  location: 'park',
  reason: 'too_hard',
};

describe('swapToStatsUpdates', () => {
  it('counts a user swap on both exercises, with no uid anywhere', () => {
    const [from, to] = swapToStatsUpdates(swap);
    expect(from.exerciseId).toBe('pu');
    expect(from.increments).toEqual({
      'bySource.in_workout_coach_hint': 1,
      swappedAway: 1,
      'byLocation.park': 1,
      'byReason.too_hard': 1,
      'byDirection.lower': 1,
      'byTab.adaptation': 1,
      'topReplacements.kpu': 1,
    });
    expect(from.labels).toMatchObject({ name: 'שכיבות סמיכה', lastLevel: 5, domain: 'push', 'replacementNames.kpu': 'שכיבות על הברכיים' });
    expect(to).toMatchObject({ exerciseId: 'kpu', increments: { swappedTo: 1 } });
    expect(JSON.stringify([from, to])).not.toContain('u1');
  });

  it('system (swap-all location) swaps never count as swappedAway', () => {
    const [from, to] = swapToStatsUpdates({ ...swap, userInitiated: false, source: 'swap_all_location', reason: undefined });
    expect(from.increments).toEqual({ 'bySource.swap_all_location': 1, systemSwappedAway: 1 });
    expect(to.increments).toEqual({ systemSwappedTo: 1 });
  });

  it("'pain' is counted as a reason but never as a difficulty/preference signal", () => {
    const [from] = swapToStatsUpdates({ ...swap, reason: 'pain' });
    expect(from.increments['byReason.pain']).toBe(1);
    expect(from.increments.swappedAway).toBe(1);
    expect(Object.keys(from.increments).some((k) => k.startsWith('byDirection.'))).toBe(false);
    expect(Object.keys(from.increments).some((k) => k.startsWith('byTab.'))).toBe(false);
    expect(Object.keys(from.increments).some((k) => k.startsWith('topReplacements.'))).toBe(false);
  });

  it('ignores unknown enum values and bad ids', () => {
    const [from] = swapToStatsUpdates({ ...swap, direction: 'up', tab: 'x', reason: 'meh' });
    expect(Object.keys(from.increments).filter((k) => /^by(Direction|Tab|Reason)\./.test(k))).toEqual([]);
    expect(swapToStatsUpdates({ ...swap, toExerciseId: 'pu' })).toEqual([]);
    expect(swapToStatsUpdates({ ...swap, fromExerciseId: undefined })).toEqual([]);
  });
});

describe('workoutToStatsUpdates', () => {
  const workout = {
    category: 'strength',
    segments: [
      {
        kind: 'strength',
        actual: {
          exerciseLog: [
            { exerciseId: 'pu', exerciseName: 'PU', confirmedReps: [10, 9], exerciseLevel: 5, domain: 'push' },
            { exerciseId: 'kpu', exerciseName: 'KPU', confirmedReps: [12], wasSwapped: true },
            { exerciseId: 'skipped', exerciseName: 'S', confirmedReps: [] },
          ],
        },
      },
      { kind: 'aerobic', actual: { distanceKm: 2 } },
      // same exercise again in a second station — still one completion
      { kind: 'strength', actual: { exerciseLog: [{ exerciseId: 'pu', confirmedReps: [8] }] } },
    ],
  };

  it('+1 per finished exercise, prescribed vs swapped-in', () => {
    const u = workoutToStatsUpdates(workout);
    expect(u.find((x) => x.exerciseId === 'pu')!.increments).toEqual({ prescribedCompleted: 1 });
    expect(u.find((x) => x.exerciseId === 'pu')!.labels).toMatchObject({ lastLevel: 5, domain: 'push' });
    expect(u.find((x) => x.exerciseId === 'kpu')!.increments).toEqual({ completedAsReplacement: 1 });
    expect(u.find((x) => x.exerciseId === 'skipped')).toBeUndefined();
  });

  it('legacy / running docs produce nothing', () => {
    expect(workoutToStatsUpdates({ category: 'cardio', distance: 5 })).toEqual([]);
    expect(workoutToStatsUpdates({ segments: [{ kind: 'strength', actual: { sets: 3 } }] })).toEqual([]);
  });
});

describe('helpers', () => {
  it('safeKey keeps map keys valid field-path segments', () => {
    expect(safeKey('in_workout_log_drawer')).toBe('in_workout_log_drawer');
    expect(safeKey('a.b/c d')).toBe('a_b_c_d');
    expect(safeKey('...')).toBeNull();
    expect(safeKey(5)).toBeNull();
  });

  it('mergeUpdates sums per exercise', () => {
    const m = mergeUpdates([
      { exerciseId: 'a', increments: { x: 1 }, labels: { name: 'A' } },
      { exerciseId: 'a', increments: { x: 2, y: 1 }, labels: {} },
    ]);
    expect(m).toEqual([{ exerciseId: 'a', increments: { x: 3, y: 1 }, labels: { name: 'A' } }]);
  });

  it('toNestedPatch builds the nested merge shape', () => {
    expect(
      toNestedPatch({ swappedAway: 1, 'byDirection.lower': 2 }, { name: 'A', 'replacementNames.b': 'B' }, (n) => ({ inc: n })),
    ).toEqual({ name: 'A', replacementNames: { b: 'B' }, swappedAway: { inc: 1 }, byDirection: { lower: { inc: 2 } } });
  });
});
