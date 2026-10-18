/**
 * The ONE step-goal resolver (lib/step-goal.ts) — shared by the app and the
 * Cloud Functions (vendored). Server agreement is covered by
 * functions/src/__tests__/stepGoalResolver.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  addDays,
  adaptiveTargetFromDays,
  BASE_STEP_GOAL,
  resolveStepGoal,
  sanitizeManualStepGoal,
  stepGoalNeedsRecentDays,
  type StepDay,
} from '../step-goal';
import { DAILY_STEP_GOAL } from '@/config/health-goals';

const TODAY = '2026-10-18';

/** n days before today, each with the given steps (cycled). */
function days(stepsList: number[]): StepDay[] {
  return stepsList.map((steps, i) => ({ date: addDays(TODAY, -(i + 1)), steps }));
}

describe('server mirror', () => {
  it('functions/src/shared/step-goal.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const app = readFileSync(path.join(root, 'src/features/activity/lib/step-goal.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/step-goal.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });
});

describe('base', () => {
  it('BASE_STEP_GOAL is the app-wide DAILY_STEP_GOAL (8000)', () => {
    expect(BASE_STEP_GOAL).toBe(8000);
    expect(DAILY_STEP_GOAL).toBe(BASE_STEP_GOAL);
  });
});

describe('adaptiveTargetFromDays', () => {
  it('null with fewer than 5 days of data', () => {
    expect(adaptiveTargetFromDays(days([9000, 9000, 9000, 9000]), TODAY)).toBeNull();
  });
  it('0-step days, today, and days older than 14 do not count as data', () => {
    const d = [
      ...days([9000, 0, 9000, 0, 9000, 9000]),
      { date: TODAY, steps: 20000 },
      { date: addDays(TODAY, -15), steps: 20000 },
    ];
    expect(adaptiveTargetFromDays(d, TODAY)).toBeNull(); // only 4 real days
  });
  it('median × 1.1, rounded to 500', () => {
    // median 7000 → 7700 → 7500
    expect(adaptiveTargetFromDays(days([5000, 6000, 7000, 8000, 9000]), TODAY)).toBe(7500);
    // even count: median (6000+7000)/2 = 6500 → 7150 → 7000
    expect(adaptiveTargetFromDays(days([5000, 6000, 7000, 8000, 4000, 9000]), TODAY)).toBe(7000);
  });
  it('clamped to 4000–12000', () => {
    expect(adaptiveTargetFromDays(days([1000, 1200, 900, 1500, 800]), TODAY)).toBe(4000);
    expect(adaptiveTargetFromDays(days([20000, 25000, 18000, 22000, 30000]), TODAY)).toBe(12000);
  });
  it('a duplicated date counts once (higher value)', () => {
    const d = [...days([9000, 9000, 9000, 9000]), { date: addDays(TODAY, -1), steps: 1 }];
    expect(adaptiveTargetFromDays(d, TODAY)).toBeNull();
  });
});

describe('resolveStepGoal — auto', () => {
  it('no profile, no data → 8000, persisted with today stamp', () => {
    const r = resolveStepGoal(undefined, [], TODAY);
    expect(r.goal).toBe(8000);
    expect(r.mode).toBe('auto');
    expect(r.shouldPersist).toBe(true);
    expect(r.persist).toEqual({ dailyStepGoal: 8000, stepGoalMode: 'auto', stepGoalComputedOn: TODAY });
  });

  it('legacy unstamped 3000 is ignored (starts from 8000)', () => {
    expect(resolveStepGoal({ dailyStepGoal: 3000 }, [], TODAY).goal).toBe(8000);
  });

  it('<5 days of data → 8000 target', () => {
    expect(resolveStepGoal({}, days([2000, 2000, 2000]), TODAY).goal).toBe(8000);
  });

  it('first recompute moves at most ±1000 from 8000', () => {
    // walker: median 15000 → target 12000, capped at 9000
    expect(resolveStepGoal({}, days([15000, 15000, 15000, 15000, 15000]), TODAY).goal).toBe(9000);
    // light walker: median 3000 → target 4000, capped at 7000
    expect(resolveStepGoal({}, days([3000, 3000, 3000, 3000, 3000]), TODAY).goal).toBe(7000);
  });

  it('within the cap the median target is used as is', () => {
    // median 7000 → 7500, prev 8000 → 7500
    expect(resolveStepGoal({}, days([5000, 6000, 7000, 8000, 9000]), TODAY).goal).toBe(7500);
  });

  it('stamped < 7 days ago → stored goal, no recompute', () => {
    const p = { dailyStepGoal: 6500, stepGoalMode: 'auto', stepGoalComputedOn: addDays(TODAY, -6) };
    const r = resolveStepGoal(p, days([15000, 15000, 15000, 15000, 15000]), TODAY);
    expect(r).toMatchObject({ goal: 6500, source: 'auto-stored', shouldPersist: false });
    expect(stepGoalNeedsRecentDays(p, TODAY)).toBe(false);
  });

  it('a stamp in the future (clock skew) also counts as fresh', () => {
    const p = { dailyStepGoal: 6500, stepGoalComputedOn: addDays(TODAY, 1) };
    expect(resolveStepGoal(p, [], TODAY).source).toBe('auto-stored');
  });

  it('stamped ≥ 7 days ago → weekly recompute from the stored goal, ±1000 cap', () => {
    const p = { dailyStepGoal: 6500, stepGoalMode: 'auto', stepGoalComputedOn: addDays(TODAY, -7) };
    expect(stepGoalNeedsRecentDays(p, TODAY)).toBe(true);
    const up = resolveStepGoal(p, days([15000, 15000, 15000, 15000, 15000]), TODAY);
    expect(up.goal).toBe(7500);
    expect(up.persist).toEqual({ dailyStepGoal: 7500, stepGoalMode: 'auto', stepGoalComputedOn: TODAY });
    const down = resolveStepGoal(p, days([1000, 1000, 1000, 1000, 1000]), TODAY);
    expect(down.goal).toBe(5500);
  });

  it('never leaves 4000–12000 in auto', () => {
    const low = { dailyStepGoal: 4000, stepGoalComputedOn: addDays(TODAY, -10) };
    expect(resolveStepGoal(low, days([500, 500, 500, 500, 500]), TODAY).goal).toBe(4000);
    const high = { dailyStepGoal: 12000, stepGoalComputedOn: addDays(TODAY, -10) };
    expect(resolveStepGoal(high, days([30000, 30000, 30000, 30000, 30000]), TODAY).goal).toBe(12000);
  });
});

describe('resolveStepGoal — manual override', () => {
  it('manual goal wins, regardless of data or stamp, never persisted', () => {
    const r = resolveStepGoal(
      { stepGoalMode: 'manual', dailyStepGoal: 15000, stepGoalComputedOn: addDays(TODAY, -30) },
      days([2000, 2000, 2000, 2000, 2000]),
      TODAY,
    );
    expect(r).toMatchObject({ goal: 15000, mode: 'manual', source: 'manual', shouldPersist: false });
  });
  it('manual is snapped to 500 within 2000–20000', () => {
    expect(sanitizeManualStepGoal(7240)).toBe(7000);
    expect(sanitizeManualStepGoal(500)).toBe(2000);
    expect(sanitizeManualStepGoal(99999)).toBe(20000);
    expect(sanitizeManualStepGoal('8000')).toBeNull();
  });
  it('manual without a usable number falls back to auto', () => {
    expect(resolveStepGoal({ stepGoalMode: 'manual', dailyStepGoal: null }, [], TODAY)).toMatchObject({
      goal: 8000,
      mode: 'auto',
    });
  });
});
