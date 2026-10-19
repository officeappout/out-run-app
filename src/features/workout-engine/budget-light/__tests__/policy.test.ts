import { describe, it, expect } from 'vitest';
import {
  resolveBudgetLightMode, remainingWeeklyStrengthSets, isDailyStrengthBudgetSpent,
  LIGHT_MODE_REMAINING_THRESHOLD, LIGHT_SESSION_SETS_CAP, LIGHT_INTENSITY_CAP, NORMAL_DECISION,
  type BudgetLightInput,
} from '../policy';
import { budgetLightText, copyGenderOf, BUDGET_LIGHT_COPY } from '../copy';
import { snapshotFromVolumeStore, strengthSetsDoneToday, trainingDaysOf } from '../snapshot';

const LIGHT_WEEKLY = { mode: 'light', setsCap: LIGHT_SESSION_SETS_CAP, intensityCap: LIGHT_INTENSITY_CAP, reasonKey: 'budget_light.weekly_spent' };
const LIGHT_DAILY = { ...LIGHT_WEEKLY, reasonKey: 'budget_light.daily_spent' };

describe('resolveBudgetLightMode — policy table', () => {
  const snap = (weeklyBudget: number, totalSetsCompleted: number, setsDoneToday?: number, trainingDaysPerWeek?: number) =>
    ({ weeklyBudget, totalSetsCompleted, setsDoneToday, trainingDaysPerWeek });
  const rows: Array<[string, BudgetLightInput, object]> = [
    ['flag off, week spent → normal', { enabled: false, entry: 'recommended', snapshot: snap(30, 30) }, NORMAL_DECISION],
    ['manual entry, week spent → normal (never restricted)', { enabled: true, entry: 'manual', snapshot: snap(30, 30) }, NORMAL_DECISION],
    ['recommended, plenty left → normal', { enabled: true, entry: 'recommended', snapshot: snap(30, 10) }, NORMAL_DECISION],
    ['recommended, exactly threshold left → normal', { enabled: true, entry: 'recommended', snapshot: snap(30, 30 - LIGHT_MODE_REMAINING_THRESHOLD) }, NORMAL_DECISION],
    ['recommended, threshold−1 left → light (weekly)', { enabled: true, entry: 'recommended', snapshot: snap(30, 30 - LIGHT_MODE_REMAINING_THRESHOLD + 1) }, LIGHT_WEEKLY],
    ['recommended, over budget → light (weekly)', { enabled: true, entry: 'recommended', snapshot: snap(30, 41) }, LIGHT_WEEKLY],
    ['budget 0 = store not initialised → unknown → normal', { enabled: true, entry: 'recommended', snapshot: snap(0, 0) }, NORMAL_DECISION],
    ['no snapshot, remaining fallback 3 → light', { enabled: true, entry: 'recommended', remainingWeeklySets: 3 }, LIGHT_WEEKLY],
    ['no snapshot, remaining fallback 20 → normal', { enabled: true, entry: 'recommended', remainingWeeklySets: 20 }, NORMAL_DECISION],
    ['nothing known → normal', { enabled: true, entry: 'recommended' }, NORMAL_DECISION],
    ['today done (12 ≥ ceil(30/3)=10), week fine → light (daily)', { enabled: true, entry: 'recommended', snapshot: snap(30, 12, 12, 3) }, LIGHT_DAILY],
    ['today partly done (6 < 10) → normal', { enabled: true, entry: 'recommended', snapshot: snap(30, 6, 6, 3) }, NORMAL_DECISION],
    ['today done but week days unknown → normal', { enabled: true, entry: 'recommended', snapshot: snap(30, 12, 12) }, NORMAL_DECISION],
    ['week AND day spent → weekly reason wins', { enabled: true, entry: 'recommended', snapshot: snap(30, 28, 12, 3) }, LIGHT_WEEKLY],
  ];
  it.each(rows)('%s', (_name, input, expected) => {
    expect(resolveBudgetLightMode(input)).toEqual(expected);
  });

  it('snapshot beats the remaining fallback', () => {
    expect(remainingWeeklyStrengthSets({ snapshot: { weeklyBudget: 30, totalSetsCompleted: 5 }, remainingWeeklySets: 1 })).toBe(25);
    expect(remainingWeeklyStrengthSets({ snapshot: { weeklyBudget: 0, totalSetsCompleted: 0 }, remainingWeeklySets: 4 })).toBe(4);
  });

  it('daily budget needs today\'s sets and the week days', () => {
    expect(isDailyStrengthBudgetSpent(null)).toBe(false);
    expect(isDailyStrengthBudgetSpent({ weeklyBudget: 20, totalSetsCompleted: 7, setsDoneToday: 7, trainingDaysPerWeek: 3 })).toBe(true);
    expect(isDailyStrengthBudgetSpent({ weeklyBudget: 20, totalSetsCompleted: 0, setsDoneToday: 0, trainingDaysPerWeek: 3 })).toBe(false);
  });
});

describe('copy — gender variants, simple voice, no slashes', () => {
  it('every key has distinct male / female card + description lines without "/"', () => {
    for (const forms of Object.values(BUDGET_LIGHT_COPY)) {
      for (const v of Object.values(forms)) {
        expect(v.male).not.toBe(v.female);
        expect(v.male).not.toMatch(/\//);
        expect(v.female).not.toMatch(/\//);
      }
    }
  });
  it('picks by gender (other / missing → male)', () => {
    expect(budgetLightText('budget_light.weekly_spent', 'card', 'female')).toContain('תני');
    expect(budgetLightText('budget_light.weekly_spent', 'card', 'male')).toContain('תן ');
    expect(budgetLightText('budget_light.weekly_spent', 'description', null)).toContain('השבוע כבר עשית את רוב הכוח');
    expect(budgetLightText('budget_light.daily_spent', 'description', 'female')).toContain('ואת ממשיכה');
    expect(copyGenderOf({ core: { gender: 'female' } })).toBe('female');
    expect(copyGenderOf({ core: { gender: 'other' } })).toBe('male');
    expect(copyGenderOf(null)).toBe('male');
  });
});

describe('snapshot from the weekly volume store', () => {
  const now = new Date(2026, 9, 19, 18, 0);
  it('sums today\'s non-recovery sets (Date or persisted string)', () => {
    const logs = [
      { completedAt: new Date(2026, 9, 19, 8, 0), setsCompleted: 6, isRecovery: false },
      { completedAt: new Date(2026, 9, 19, 9, 0).toISOString(), setsCompleted: 4, isRecovery: false },
      { completedAt: new Date(2026, 9, 19, 10, 0), setsCompleted: 9, isRecovery: true },
      { completedAt: new Date(2026, 9, 18, 10, 0), setsCompleted: 12, isRecovery: false },
    ];
    expect(strengthSetsDoneToday(logs, now)).toBe(10);
    expect(snapshotFromVolumeStore({ strength: { weeklyBudget: 30, totalSetsCompleted: 22 }, sessionLogs: logs }, now, 3))
      .toEqual({ weeklyBudget: 30, totalSetsCompleted: 22, setsDoneToday: 10, trainingDaysPerWeek: 3 });
    expect(snapshotFromVolumeStore(null, now)).toBeNull();
  });
  it('training days from the profile schedule', () => {
    expect(trainingDaysOf({ lifestyle: { scheduleDays: ['א', 'ג', 'ה'] } })).toBe(3);
    expect(trainingDaysOf({ lifestyle: { scheduleDays: [] } })).toBeNull();
    expect(trainingDaysOf(undefined)).toBeNull();
  });
});
