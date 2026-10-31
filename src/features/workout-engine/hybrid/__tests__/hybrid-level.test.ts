import { describe, expect, it } from 'vitest';
import type { HybridFinalizeResult } from '../hybrid-orchestrator';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import { activeStrengthProgramId, levelMoved, stationExerciseResults, stationProgramLookup } from '../hybrid-level';
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';

const plan = [
  { index: 0, kind: 'aerobic', estCalories: 0 },
  {
    index: 1, kind: 'strength', estCalories: 0,
    content: { exercises: [
      { exercise: { id: 'pu', targetPrograms: [{ programId: 'push' }], programIds: ['push', 'full_body'] } },
      { exercise: { id: 'sq' } },
    ] },
  },
] as unknown as HybridPlannedSegment[];

const result = {
  summary: {},
  segments: [
    { index: 0, kind: 'aerobic', actual: { durationSec: 600 } },
    { index: 1, kind: 'strength', actual: { exerciseLog: [
      { exerciseId: 'pu', exerciseName: 'Push-up', confirmedReps: [10, 9], targetReps: 10 },
      { exerciseId: 'sq', exerciseName: 'Squat', confirmedReps: [], targetReps: 15 },
    ] } },
    { index: 2, kind: 'strength', skipped: true, actual: { exerciseLog: [{ exerciseId: 'x', exerciseName: 'X', confirmedReps: [5], targetReps: 5 }] } },
  ],
} as unknown as HybridFinalizeResult;

describe('hybrid level (board PlayerSummaryCoverage)', () => {
  it('program lookup from the stations, de-duplicated', () => {
    expect(stationProgramLookup(plan).get('pu')).toEqual(['push', 'full_body']);
    expect(stationProgramLookup(plan).has('sq')).toBe(false);
  });
  it('only logged sets of done stations feed the engine', () => {
    expect(stationExerciseResults(result, plan)).toEqual([{
      exerciseId: 'pu', exerciseName: 'Push-up', programLevels: { push: 1, full_body: 1 },
      setsCompleted: 2, repsPerSet: [10, 9], targetReps: 10, isCompound: false,
    }]);
  });
  it('active program like the strength page', () => {
    expect(activeStrengthProgramId({ progression: { activePrograms: [{ id: 'pull' }] } })).toBe('pull');
    expect(activeStrengthProgramId({ currentProgramId: 'legs' })).toBe('legs');
    expect(activeStrengthProgramId(null)).toBe('full_body');
  });
  it('moved = a new level or a real percent gain', () => {
    const o = (b: [number, number], a: [number, number]): LevelUpOutcome =>
      ({ kind: 'leaf', programId: 'p', before: { level: b[0], percent: b[1] }, after: { level: a[0], percent: a[1] }, leveledUp: a[0] > b[0], totalGain: 0, chips: [], isFirstWorkout: false });
    expect(levelMoved(o([3, 40], [3, 44]))).toBe(true);
    expect(levelMoved(o([3, 95], [4, 2]))).toBe(true);
    expect(levelMoved(o([3, 40], [3, 40]))).toBe(false);
    expect(levelMoved(null)).toBe(false);
  });
});
