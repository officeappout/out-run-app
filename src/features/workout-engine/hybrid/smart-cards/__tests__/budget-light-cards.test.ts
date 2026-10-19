/**
 * Budget light mode on the map's situation-aware cards: a spent strength budget no longer
 * hides the full-park card or shrinks the walk's strength stop to a 5-minute sliver — both
 * stay, as lighter strength, with the "why" line. budgetLight absent → exactly as before.
 */
import { describe, it, expect } from 'vitest';
import { rankHybridCards, rankFullPark, rankWalkStrength, lightDecisionOf } from '../rank-hybrid-cards';
import { sizeSmartSession, SPENT_BUDGET_STATION_MIN, MIN_PER_SET } from '../smart-sizing';
import { LIGHT_SESSION_SETS_CAP } from '../../../budget-light/policy';
import type { HybridSituation } from '../situation.types';

const sit = (over: Partial<HybridSituation> = {}): HybridSituation => ({
  hasGps: true,
  aerobicKind: 'walking',
  gender: 'male',
  nearestEquippedPark: { id: 'p1', name: 'גינת הכושר', distanceM: 400 },
  routesWithStops: [],
  steps: { stepsRemaining: 4200, stepGoal: 8000 },
  strength: { weeklyBudget: 40, totalSetsCompleted: 39 }, // 1 left → spent
  todayScheduled: 'none',
  hasStrengthProgram: true,
  hour: 17,
  weatherFlag: null,
  flags: { walkStrength: true, fullPark: true, routeStops: true },
  ...over,
});

describe('budget light mode — map cards', () => {
  it('flag off (budgetLight absent): spent → full park hidden, walk strength is the short core stop (unchanged)', () => {
    const s = sit();
    expect(lightDecisionOf(s).mode).toBe('normal');
    expect(rankFullPark(s)).toBeNull();
    const w = rankWalkStrength(s)!;
    expect(w.sizing!.setsSource).toBe('spent');
    expect(w.sizing!.strengthMin).toBe(SPENT_BUDGET_STATION_MIN);
    expect(w.reason).toContain('הכוח השבוע כבר סגור');
  });

  it('flag on: spent → walk strength gets a light strength part + the "why"', () => {
    const w = rankWalkStrength(sit({ budgetLight: true }))!;
    expect(w.sizing!.setsSource).toBe('light');
    expect(w.sizing!.strengthSets).toBe(LIGHT_SESSION_SETS_CAP);
    expect(w.sizing!.strengthMin).toBe(Math.round(LIGHT_SESSION_SETS_CAP * MIN_PER_SET));
    expect(w.sizing!.lightReasonKey).toBe('budget_light.weekly_spent');
    expect(w.reason).toBe('נשארו לך 4,200 צעדים. השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר. תן לשרירים להתאושש');
  });

  it('flag on: female copy, and the walk is not hidden when the step goal is also met', () => {
    const w = rankWalkStrength(sit({ budgetLight: true, gender: 'female', steps: { stepsRemaining: 0, stepGoal: 8000 } }))!;
    expect(w).not.toBeNull();
    expect(w.reason).toBe('השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר. תני לשרירים להתאושש');
  });

  it('flag on: spent → the full park card stays (low), with the light reason', () => {
    const fp = rankFullPark(sit({ budgetLight: true }))!;
    expect(fp).not.toBeNull();
    expect(fp.reason).toContain('משהו קל יותר');
    expect(fp.score).toBeLessThan(rankWalkStrength(sit({ budgetLight: true }))!.score);
    expect(rankHybridCards(sit({ budgetLight: true })).map((c) => c.id)).toContain('full_park');
  });

  it('flag on: today\'s share done (daily) → daily reason', () => {
    const s = sit({ budgetLight: true, strength: { weeklyBudget: 30, totalSetsCompleted: 10, setsDoneToday: 10, trainingDaysPerWeek: 3 } });
    expect(lightDecisionOf(s).reasonKey).toBe('budget_light.daily_spent');
    expect(rankFullPark(s)!.reason).toContain('היום כבר עשית את הכוח שלך');
  });

  it('flag on, budget NOT spent → same cards and reasons as flag off', () => {
    const plenty = { weeklyBudget: 40, totalSetsCompleted: 10 };
    expect(rankHybridCards(sit({ budgetLight: true, strength: plenty }))).toEqual(rankHybridCards(sit({ strength: plenty })));
  });

  it('sizeSmartSession without a light decision is unchanged', () => {
    const args = { steps: null, strength: { weeklyBudget: 40, totalSetsCompleted: 39 }, kind: 'walking' as const, parkDistanceM: 300 };
    expect(sizeSmartSession(args)).toEqual(sizeSmartSession({ ...args, light: null }));
  });
});
