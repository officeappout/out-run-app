import { describe, it, expect } from 'vitest';
import {
  sizeWalkKm, sizeStrengthSets, sizeSmartSession, stepsToKm, smartComposeBudgetMin, smartParkRadiusM,
  DEFAULT_SESSION_SETS, MAX_SESSION_SETS, GOAL_MET_WALK_KM, UNKNOWN_STEPS_WALK_KM, MAX_WALK_KM, MIN_WALK_KM,
  SPENT_BUDGET_STATION_MIN, MIN_PER_SET,
} from '../smart-sizing';
import { drawerIntentToSmart } from '../drawer-smart-intent';

describe('steps → walking distance', () => {
  it('4,000 remaining steps ≈ 3 km of walking', () => {
    expect(stepsToKm(4000, 'walking')).toBeCloseTo(3, 5);
    expect(sizeWalkKm({ stepsRemaining: 4000, stepGoal: 8000 }, 'walking')).toEqual({ km: 3, source: 'steps' });
  });

  it('running strides are longer → more km per step', () => {
    expect(stepsToKm(4000, 'running')).toBeGreaterThan(stepsToKm(4000, 'walking'));
  });

  it('clamps tiny and huge gaps', () => {
    expect(sizeWalkKm({ stepsRemaining: 300, stepGoal: 8000 }, 'walking').km).toBe(MIN_WALK_KM);
    expect(sizeWalkKm({ stepsRemaining: 30000, stepGoal: 30000 }, 'walking').km).toBe(MAX_WALK_KM);
  });

  it('goal met → a short loop; no data → a medium default', () => {
    expect(sizeWalkKm({ stepsRemaining: 0, stepGoal: 8000 }, 'walking')).toEqual({ km: GOAL_MET_WALK_KM, source: 'goal_met' });
    expect(sizeWalkKm(null, 'walking')).toEqual({ km: UNKNOWN_STEPS_WALK_KM, source: 'unknown' });
    expect(sizeWalkKm({ stepsRemaining: 5000, stepGoal: 0 }, 'walking').source).toBe('unknown');
  });
});

describe('weekly budget → strength sets', () => {
  it('uses the remaining sets, capped per session', () => {
    expect(sizeStrengthSets({ weeklyBudget: 40, totalSetsCompleted: 34 })).toEqual({ sets: 6, source: 'budget', remaining: 6 });
    expect(sizeStrengthSets({ weeklyBudget: 60, totalSetsCompleted: 0 }).sets).toBe(MAX_SESSION_SETS);
  });

  it('uninitialised budget (0) is unknown, not spent', () => {
    expect(sizeStrengthSets({ weeklyBudget: 0, totalSetsCompleted: 0 })).toEqual({ sets: DEFAULT_SESSION_SETS, source: 'unknown', remaining: null });
    expect(sizeStrengthSets(null).source).toBe('unknown');
  });

  it('fewer than a coherent station left → spent (0 sets)', () => {
    expect(sizeStrengthSets({ weeklyBudget: 40, totalSetsCompleted: 38 })).toEqual({ sets: 0, source: 'spent', remaining: 2 });
  });
});

describe('sizeSmartSession', () => {
  it('walk minutes + strength minutes = the time budget, share = walk part', () => {
    const s = sizeSmartSession({
      steps: { stepsRemaining: 4000, stepGoal: 8000 },
      strength: { weeklyBudget: 40, totalSetsCompleted: 34 },
      kind: 'walking', parkDistanceM: 300,
    });
    expect(s.walkKm).toBe(3);
    expect(s.walkMin).toBe(36);
    expect(s.strengthSets).toBe(6);
    expect(s.strengthMin).toBe(6 * MIN_PER_SET);
    expect(s.timeBudgetMin).toBe(45);
    expect(s.aerobicShare).toBeCloseTo(0.8, 2);
  });

  it('the walk always reaches the park and back', () => {
    const s = sizeSmartSession({
      steps: { stepsRemaining: 500, stepGoal: 8000 }, strength: null, kind: 'walking', parkDistanceM: 1000,
    });
    expect(s.walkKm).toBeGreaterThanOrEqual(2.3);
  });

  it('spent budget keeps a short station (core default downstream)', () => {
    const s = sizeSmartSession({
      steps: { stepsRemaining: 3000, stepGoal: 8000 }, strength: { weeklyBudget: 40, totalSetsCompleted: 40 },
      kind: 'walking', parkDistanceM: 200,
    });
    expect(s.setsSource).toBe('spent');
    expect(s.strengthMin).toBe(SPENT_BUDGET_STATION_MIN);
  });
});

describe('compose budget for the real route', () => {
  it('real km × planner walk pace + the card strength minutes', () => {
    expect(smartComposeBudgetMin(3, 'walking', 9)).toBe(39);
    expect(smartComposeBudgetMin(0, 'walking', 2)).toBe(10); // floor
    expect(smartComposeBudgetMin(4, 'running', 10, 360)).toBe(34);
  });
  it('park radius is wider for running', () => {
    expect(smartParkRadiusM('running')).toBeGreaterThan(smartParkRadiusM('walking'));
  });
});

describe('drawer "תחנות כוח" → smart walk', () => {
  it('keeps the drawer time/share, switches the mode and targets the park', () => {
    const out = drawerIntentToSmart(
      { timeBudgetMin: 40, aerobicShare: 0.6, emphasis: 'balanced', aerobicKind: 'walking' }, 'park-1');
    expect(out.mode).toBe('smart_walk_strength');
    expect(out.timeBudgetMin).toBe(40);
    expect(out.smart).toEqual({ targetKm: 2, parkId: 'park-1', strengthMin: 16 });
  });
});
