import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { goalPresenceBoostIds, goalRampTarget, recentIdsByDomain, type SessionLogLike } from '../goal-presence';
import { assignVolume } from '../../workout-budgeting.utils';
import type { WorkoutGenerationContext, VolumeAdjustment } from '../../workout-generator.types';
import type { ScoredExercise } from '../../contextual-engine.types';
import { POLICY_OFF } from '../policy';
import { GOAL_STEP_REPS } from '../adaptive.config';

describe('recentIdsByDomain', () => {
  it('per area: the last 2 sessions that trained it, newest first', () => {
    const logs = [
      { domainSets: { pull: 3 }, exerciseIds: ['old-pull'] },
      { domainSets: { pull: 3, push: 2 }, exerciseIds: ['a', 'b'] },
      { domainSets: { legs: 4 }, exerciseIds: ['sq'] },
      { domainSets: { pull: 2 }, exerciseIds: ['c'] },
    ] as SessionLogLike[];
    const m = recentIdsByDomain(logs);
    expect(m.pull.sort()).toEqual(['a', 'b', 'c']);
    expect(m.push.sort()).toEqual(['a', 'b']);
    expect(m.legs).toEqual(['sq']);
  });
});

describe('goalPresenceBoostIds', () => {
  const byId = new Map([['pu', { id: 'pu', movementGroup: 'vertical_pull' }], ['dip', { id: 'dip', movementGroup: 'vertical_push' }]]);
  it('boosts a goal absent from its area, not one seen there', () => {
    const s = goalPresenceBoostIds({ goalIds: ['pu', 'dip'], exercisesById: byId, recentByDomain: { pull: ['pu'], push: ['x'] } });
    expect(Array.from(s)).toEqual(['dip']);
  });
  it('falls back to the plain recent list, then to "absent"', () => {
    expect(Array.from(goalPresenceBoostIds({ goalIds: ['pu'], exercisesById: byId, recentIds: ['pu'] }))).toEqual([]);
    expect(Array.from(goalPresenceBoostIds({ goalIds: ['pu'], exercisesById: byId }))).toEqual(['pu']);
  });
});

describe('goalRampTarget', () => {
  it('max(today, last best + step), never above the goal; no step when 3a already stepped', () => {
    expect(goalRampTarget({ current: 4, lastBest: 7, goal: 10, isHold: false, adaptiveOn: false })).toBe(7 + GOAL_STEP_REPS);
    expect(goalRampTarget({ current: 4, lastBest: 7, goal: 10, isHold: false, adaptiveOn: true })).toBe(7);
    expect(goalRampTarget({ current: 4, lastBest: 12, goal: 10, isHold: false, adaptiveOn: false })).toBe(10);
    expect(goalRampTarget({ current: 4, lastBest: null, goal: 10, isHold: false, adaptiveOn: false })).toBe(4);
  });
});

describe('assignVolume goal ramp', () => {
  const pullup = { id: 'pu', name: { he: 'מתח' }, type: 'reps', mechanicalType: 'bent_arm', movementGroup: 'vertical_pull', symmetry: 'bilateral', tags: [] } as never;
  const scored: ScoredExercise & { levelDiff: number } = { exercise: pullup, method: 'bodyweight' as never, mechanicalType: 'bent_arm' as never, score: 80, reasoning: [], levelDiff: 0 };
  const noAdj: VolumeAdjustment = { reason: 'inactivity', reductionPercent: 0, originalSets: 0, adjustedSets: 0, badge: '' };
  const base = {
    availableTime: 30, userLevel: 10, daysInactive: 0, intentMode: 'standard', persona: null, location: 'park', injuryCount: 0,
    levelProgressPercent: 80, goalExerciseIds: new Set(['pu']), goalTargets: new Map([['pu', { targetValue: 10, unit: 'reps' }]]),
    workoutsCompletedInLevel: 0, exerciseHistoryMap: { pu: [7, 6] },
  };
  beforeEach(() => { for (const k of ['log', 'warn', 'group', 'groupEnd'] as const) vi.spyOn(console, k).mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('OFF: the 30 % start and the range raised to the goal (today)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [r] = assignVolume([scored], base as unknown as WorkoutGenerationContext, noAdj, 2);
    expect(r.rampedTarget).toBe(3);
    expect(r.repsRange!.max).toBe(10);
  });

  it('ON: performance-driven — last best + 1, range only as high as that', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ctx = { ...base, progressionPolicy: { ...POLICY_OFF, goalPresence: true } } as unknown as WorkoutGenerationContext;
    const [r] = assignVolume([scored], ctx, noAdj, 2);
    expect(r.rampedTarget).toBe(8);
    expect(r.reps).toBe(8);
    expect(r.repsRange!.max).toBe(8);
  });
});
