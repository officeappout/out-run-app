import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assignVolume } from '../../workout-budgeting.utils';
import type { WorkoutGenerationContext, VolumeAdjustment } from '../../workout-generator.types';
import type { ScoredExercise } from '../../contextual-engine.types';
import { POLICY_OFF } from '../policy';
import type { AdaptiveState } from '../double-progression';
import { isProgressHoldSession } from '../session-gates';

const ON = { ...POLICY_OFF, adaptiveReps: true };
const pullup = { id: 'pu', name: { he: 'מתח' }, type: 'reps', mechanicalType: 'bent_arm', movementGroup: 'vertical_pull', symmetry: 'bilateral', tags: [] } as never;
const scored = (levelDiff: number): ScoredExercise & { levelDiff: number } =>
  ({ exercise: pullup, method: 'bodyweight' as never, mechanicalType: 'bent_arm' as never, score: 80, reasoning: [], levelDiff });
const ctx = (extra: Partial<WorkoutGenerationContext> = {}): WorkoutGenerationContext => ({
  availableTime: 30, userLevel: 10, daysInactive: 0, intentMode: 'standard', persona: null, location: 'park',
  injuryCount: 0, levelProgressPercent: 80, ...extra,
}) as never;
const noAdj: VolumeAdjustment = { reason: 'inactivity', reductionPercent: 0, originalSets: 0, adjustedSets: 0, badge: '' };
const state = (p: Partial<AdaptiveState>): AdaptiveState => ({
  v: 1, nextTarget: 5, topStreak: 0, missStreak: 0, extraSets: 0, variationStep: 0, isHold: false,
  range: { min: 4, max: 6 }, updatedAtMs: Date.now(), ...p,
});

beforeEach(() => {
  for (const k of ['log', 'warn', 'group', 'groupEnd'] as const) vi.spyOn(console, k).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('assignVolume with 3a', () => {
  it('OFF: random placement and the history floor (today)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [r] = assignVolume([scored(0)], ctx({ exerciseHistoryMap: { pu: [5, 5] } }), noAdj, 2);
    expect(r.reps).toBe(5); // floored from 4
  });

  it('ON, no state: deterministic — range min raised to last best', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const [a] = assignVolume([scored(0)], ctx({ progressionPolicy: ON }), noAdj, 2);
    expect(a.reps).toBe(a.repsRange!.min);
    const [b] = assignVolume([scored(0)], ctx({ progressionPolicy: ON, exerciseHistoryMap: { pu: [5] } }), noAdj, 2);
    expect(b.reps).toBe(5);
  });

  it('ON, with state: the stored target, and +1 set once earned', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = assignVolume([scored(0)], ctx({ progressionPolicy: ON }), noAdj, 2)[0];
    const [r] = assignVolume(
      [scored(0)],
      ctx({ progressionPolicy: ON, adaptiveStates: { pu: state({ nextTarget: 6, extraSets: 1 }) } }),
      noAdj, 2,
    );
    expect(r.reps).toBe(6);
    expect(r.sets).toBe(base.sets + 1);
  });

  it('ON: states are ignored while the flag is off', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [r] = assignVolume([scored(0)], ctx({ adaptiveStates: { pu: state({ nextTarget: 6, extraSets: 1 }) } }), noAdj, 2);
    expect(r.reps).toBe(4);
  });
});

describe('isProgressHoldSession', () => {
  it('deload week / heat / calm return / recovery hold; a normal session counts', () => {
    expect(isProgressHoldSession({ periodizationWeek: 5 })).toBe(true);
    expect(isProgressHoldSession({ heat: true })).toBe(true);
    expect(isProgressHoldSession({ calmReturnLightened: true })).toBe(true);
    expect(isProgressHoldSession({ isRecovery: true })).toBe(true);
    expect(isProgressHoldSession({ periodizationWeek: 2 })).toBe(false);
  });
});
