/**
 * Budget light mode for route stops / smart walk (budget-light-hybrid.ts):
 *   flag off → applySpentBudgetCoreDefault exactly (strength → core when spent)
 *   flag on  → strength stops kept; stations trimmed to the light set cap
 */
import { describe, it, expect } from 'vitest';
import { planSpentBudgetStops, capHybridPlanSets } from '../budget-light-hybrid';
import { applySpentBudgetCoreDefault } from '../weekly-budget-gate';
import { LIGHT_SESSION_SETS_CAP } from '../../budget-light/policy';
import { mainWorkSets } from '../../budget-light/cap-sets';
import type { HybridPlan } from '../compose-hybrid-session.service';

const stops = [{ id: 's1', activityType: 'strength' }, { id: 's2', activityType: 'stretch' }, { id: 's3', activityType: 'strength' }];
const spent = { weeklyBudget: 30, totalSetsCompleted: 29 };
const levels = new Map<string, number>([['core', 4], ['push', 5]]);

describe('planSpentBudgetStops', () => {
  it('flag off → identical to applySpentBudgetCoreDefault (spent → core)', () => {
    const r = planSpentBudgetStops({ enabled: false, stops, strength: spent, snapshot: spent, userProgramLevels: levels });
    const legacy = applySpentBudgetCoreDefault(stops, spent, levels);
    expect(r.stops).toEqual(legacy.stops);
    expect(r.reason).toBe('defaulted_to_core');
    expect(r.decision.mode).toBe('normal');
  });

  it('flag on + spent → strength stops kept, light decision', () => {
    const r = planSpentBudgetStops({ enabled: true, stops, strength: spent, snapshot: spent, userProgramLevels: levels });
    expect(r.stops).toBe(stops);
    expect(r.stops.filter((s) => s.activityType === 'strength')).toHaveLength(2);
    expect(r.reason).toBe('light_strength');
    expect(r.decision).toMatchObject({ mode: 'light', reasonKey: 'budget_light.weekly_spent' });
  });

  it('flag on + not spent / unknown snapshot → normal, stops untouched', () => {
    const fine = { weeklyBudget: 30, totalSetsCompleted: 5 };
    expect(planSpentBudgetStops({ enabled: true, stops, strength: fine, snapshot: fine, userProgramLevels: levels }).reason).toBe('not_spent');
    expect(planSpentBudgetStops({ enabled: true, stops, strength: spent, snapshot: null, userProgramLevels: levels }).reason).toBe('not_spent');
  });
});

describe('capHybridPlanSets', () => {
  const ex = (id: string, sets: number) => ({ exercise: { id }, sets, reps: 8, exerciseRole: 'main' });
  const station = (index: number, sets: number[]) => ({
    index, kind: 'strength' as const, estCalories: 40, durationSec: 600,
    content: { exercises: sets.map((n, i) => ex(`e${index}-${i}`, n)), estimatedDurationSec: 600, totalPlannedSets: sets.reduce((a, b) => a + b, 0), isEmpty: false, log: [] },
  });
  const plan = (): HybridPlan => ({
    segments: [
      { index: 0, kind: 'aerobic', estCalories: 50, durationSec: 600 },
      station(1, [3, 3, 3]),
      { index: 2, kind: 'aerobic', estCalories: 50, durationSec: 600 },
      station(3, [3, 3, 3]),
    ],
    totals: { aerobicMin: 20, strengthMin: 20, distanceKm: 2, estCalories: 180, stations: 2 },
    meta: { emphasisResolved: 'balanced', whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: false, skippedFieldFallback: false, log: [] },
  } as unknown as HybridPlan);

  it('shares the cap between stations and shortens their time', () => {
    const out = capHybridPlanSets(plan(), LIGHT_SESSION_SETS_CAP);
    const strength = out.segments.filter((g) => g.kind === 'strength');
    const total = strength.reduce((s, g) => s + mainWorkSets(g.content!.exercises), 0);
    expect(total).toBeLessThanOrEqual(LIGHT_SESSION_SETS_CAP + strength.length); // ceil share, floor 1/exercise
    for (const g of strength) {
      expect(g.content!.estimatedDurationSec).toBeLessThan(600);
      expect(g.durationSec).toBe(g.content!.estimatedDurationSec);
    }
    expect(out.totals.strengthMin).toBeLessThan(20);
    expect(out.segments[0]).toEqual(plan().segments[0]); // walking legs untouched
  });

  it('no cap / already under the cap → the same plan object', () => {
    const p = plan();
    expect(capHybridPlanSets(p, null)).toBe(p);
    expect(capHybridPlanSets(p, 40)).toBe(p);
  });
});
