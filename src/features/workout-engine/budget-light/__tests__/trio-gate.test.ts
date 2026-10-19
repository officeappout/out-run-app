import { describe, it, expect } from 'vitest';
import { applyBudgetLightToTrio, budgetEntryOf, resolveTrioBudgetGate } from '../trio-gate';
import { LIGHT_SESSION_SETS_CAP, NORMAL_DECISION } from '../policy';
import { mainWorkSets } from '../cap-sets';
import type { HomeWorkoutOptions, HomeWorkoutTrioResult } from '../../services/home-workout.types';

const NOW = Date.parse('2026-10-19T10:00:00Z');
const profile = (gender: 'male' | 'female' = 'male', startDate?: Date) =>
  ({ id: 'u1', core: { gender }, progression: { activePrograms: [{ templateId: 'full_body', startDate }] } }) as never;
const base = (extra: Partial<HomeWorkoutOptions> = {}): HomeWorkoutOptions =>
  ({ userProfile: profile(), location: 'home', availableTime: 30, ...extra }) as HomeWorkoutOptions;

describe('resolveTrioBudgetGate', () => {
  it('flag off → the SAME options object (byte-identical path)', () => {
    const o = base({ remainingWeeklyBudget: 2, weeklyBudgetUsagePercent: 95 });
    const g = resolveTrioBudgetGate(o, false, NOW);
    expect(g.options).toBe(o);
    expect(g.decision).toEqual(NORMAL_DECISION);
  });

  it('entry: isManualOverride → manual, explicit budgetEntry wins', () => {
    expect(budgetEntryOf({})).toBe('recommended');
    expect(budgetEntryOf({ isManualOverride: true })).toBe('manual');
    expect(budgetEntryOf({ isManualOverride: true, budgetEntry: 'recommended' })).toBe('recommended');
  });

  it('manual (builder / adjuster) → budget inputs dropped: no floor, no cap, no usage cut', () => {
    const g = resolveTrioBudgetGate(base({ isManualOverride: true, remainingWeeklyBudget: 2, weeklyBudgetUsagePercent: 95 }), true, NOW);
    expect(g.entry).toBe('manual');
    expect(g.decision.mode).toBe('normal');
    expect(g.options.remainingWeeklyBudget).toBeUndefined();
    expect(g.options.weeklyBudgetUsagePercent).toBeUndefined();
    expect(g.options.isManualOverride).toBe(true);
  });

  it('adjuster (budgetEntry manual, no isManualOverride) → budget dropped, deficit math left as is', () => {
    const g = resolveTrioBudgetGate(base({ budgetEntry: 'manual', remainingWeeklyBudget: 2 }), true, NOW);
    expect(g.options.remainingWeeklyBudget).toBeUndefined();
    expect(g.options.isManualOverride).toBeUndefined();
    expect(g.decision.mode).toBe('normal');
  });

  it('recommended + spent → light: easy bolt, viable budget, budget inputs dropped', () => {
    const g = resolveTrioBudgetGate(base({ remainingWeeklyBudget: 3, weeklyBudgetUsagePercent: 90 }), true, NOW);
    expect(g.decision).toMatchObject({ mode: 'light', reasonKey: 'budget_light.weekly_spent', setsCap: LIGHT_SESSION_SETS_CAP, intensityCap: 1 });
    expect(g.options).toMatchObject({ targetDifficulty: 1, difficulty: 1, isManualOverride: true, availableTime: 20 });
    expect(g.options.remainingWeeklyBudget).toBeUndefined();
    expect(g.options.weeklyBudgetUsagePercent).toBeUndefined();
  });

  it('recommended + snapshot (store says 0 left, remaining not passed) → light', () => {
    const g = resolveTrioBudgetGate(base({ strengthBudgetSnapshot: { weeklyBudget: 24, totalSetsCompleted: 24 } }), true, NOW);
    expect(g.decision.mode).toBe('light');
  });

  it('recommended + not spent → options untouched', () => {
    const o = base({ remainingWeeklyBudget: 20 });
    expect(resolveTrioBudgetGate(o, true, NOW).options).toBe(o);
  });

  it('first program week → stale small budget ignored (old floor bypass kept)', () => {
    const o = base({ userProfile: profile('male', new Date(NOW - 2 * 86_400_000)), remainingWeeklyBudget: 2 });
    const g = resolveTrioBudgetGate(o, true, NOW);
    expect(g.decision.mode).toBe('normal');
    expect(g.options).toBe(o);
  });
});

describe('applyBudgetLightToTrio', () => {
  const main = (id: string, sets: number) => ({ exercise: { id }, sets, reps: 10, exerciseRole: 'main', restSeconds: 60, isTimeBased: false });
  const workout = () => ({
    title: 'אימון', description: 'רגיל', exercises: [main('a', 4), main('b', 4), main('c', 4), main('d', 3)],
    estimatedDuration: 40, totalPlannedSets: 15, isRecovery: false, difficulty: 1,
  });
  const trioOf = (shared: boolean): HomeWorkoutTrioResult => {
    const r = { workout: workout(), meta: {} };
    const r2 = shared ? r : { workout: workout(), meta: {} };
    return { options: [{ label: 'a', result: r }, { label: 'b', result: r2 }, { label: 'c', result: r }], isRestDay: false, labelsSource: 'fallback', meta: {} } as never;
  };
  const light = { mode: 'light', setsCap: 8, intensityCap: 1, reasonKey: 'budget_light.weekly_spent' } as const;

  it('caps the sets, explains why (gendered), stamps budgetLight, keeps padded slots shared', () => {
    const out = applyBudgetLightToTrio(trioOf(true), light, profile('female'), () => 22);
    const w = out.options[0].result.workout;
    expect(mainWorkSets(w.exercises)).toBe(8);
    expect(w.totalPlannedSets).toBe(8);
    expect(w.estimatedDuration).toBe(22);
    expect(w.budgetLight).toEqual({ reasonKey: 'budget_light.weekly_spent', setsCap: 8 });
    expect(w.description).toContain('השבוע כבר עשית את רוב הכוח');
    expect(w.description).toContain('ואת ממשיכה');
    expect(w.isRecovery).toBe(false);
    expect(out.options[0].result).toBe(out.options[2].result);
  });

  it('normal decision → the same trio object', () => {
    const t = trioOf(false);
    expect(applyBudgetLightToTrio(t, NORMAL_DECISION, profile())).toBe(t);
  });

  it('needs-assessment / recovery / empty workouts are left alone', () => {
    const t = trioOf(false);
    (t.options[1].result.workout as { needsAssessment?: boolean }).needsAssessment = true;
    const out = applyBudgetLightToTrio(t, light, profile());
    expect(out.options[1].result.workout.budgetLight).toBeUndefined();
    expect(out.options[0].result.workout.budgetLight).toBeDefined();
  });
});
