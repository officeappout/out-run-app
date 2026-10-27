/** The gradual steps goal (stepGoalPolicy 'ramp_v1', owner 27.10.2026) inside the ONE resolver. */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  rampStartStepGoal,
  rampWeeklyRaise,
  resolveStepGoal,
  stepRampCapForAge,
  STEP_RAMP_POLICY,
  type StepDay,
} from '../step-goal';

const TODAY = '2026-10-27';
const days = (steps: number[]): StepDay[] => steps.map((s, i) => ({ date: addDays(TODAY, -(i + 1)), steps: s }));

describe('start goal', () => {
  it('baseline + 500..1,000 on the 500 grid', () => {
    expect(rampStartStepGoal(days([5200, 5200, 5200]), TODAY, 9000)).toBe(6000);
    expect(rampStartStepGoal(days([5000, 5000, 5000]), TODAY, 9000)).toBe(5500);
    const g = rampStartStepGoal(days([3100, 4300, 3900, 4100]), TODAY, 9000);
    expect(g - 3850).toBeGreaterThanOrEqual(500);
    expect(g - 3850).toBeLessThanOrEqual(1000);
  });
  it('4,000 with no data (or fewer than 3 days)', () => {
    expect(rampStartStepGoal([], TODAY, 9000)).toBe(4000);
    expect(rampStartStepGoal(days([9000, 9000]), TODAY, 9000)).toBe(4000);
  });
  it('capped by age', () => {
    expect(stepRampCapForAge(65)).toBe(7000);
    expect(stepRampCapForAge(40)).toBe(9000);
    expect(stepRampCapForAge(null)).toBe(9000);
    expect(rampStartStepGoal(days([12000, 12000, 12000]), TODAY, stepRampCapForAge(70))).toBe(7000);
  });
});

describe('weekly raise', () => {
  it('none after a weak week, +500 normally, +1,000 after a strong week', () => {
    expect(rampWeeklyRaise(days([3000, 3000, 6000, 6000]), TODAY, 5000)).toBe(0);
    expect(rampWeeklyRaise([], TODAY, 5000)).toBe(0);
    expect(rampWeeklyRaise(days([6000, 6000, 6000, 1000]), TODAY, 5000)).toBe(500);
    expect(rampWeeklyRaise(days([6000, 6000, 6000, 6000, 6000]), TODAY, 5000)).toBe(1000);
  });
});

describe('resolveStepGoal with the ramp policy', () => {
  const ramp = (over: Record<string, unknown> = {}) => ({
    stepGoalPolicy: STEP_RAMP_POLICY, stepGoalMode: 'auto', dailyStepGoal: 5000, stepGoalComputedOn: addDays(TODAY, -7), stepGoalCap: 9000, ...over,
  });
  it('keeps a fresh goal for the week', () => {
    expect(resolveStepGoal(ramp({ stepGoalComputedOn: addDays(TODAY, -3) }), [], TODAY)).toMatchObject({ goal: 5000, shouldPersist: false });
  });
  it('raises weekly within the cap, holds after a weak week, never lowers', () => {
    expect(resolveStepGoal(ramp(), days([6000, 6000, 6000]), TODAY).goal).toBe(5500);
    expect(resolveStepGoal(ramp(), days([1000, 1000, 1000]), TODAY).goal).toBe(5000);
    expect(resolveStepGoal(ramp({ dailyStepGoal: 8800 }), days(Array(7).fill(12000)), TODAY).goal).toBe(9000);
    expect(resolveStepGoal(ramp({ dailyStepGoal: 9500 }), days(Array(7).fill(12000)), TODAY).goal).toBe(9500);
  });
  it('a manual goal still wins, and users without the policy are unchanged', () => {
    expect(resolveStepGoal(ramp({ stepGoalMode: 'manual', dailyStepGoal: 12000 }), [], TODAY).goal).toBe(12000);
    const plain = { dailyStepGoal: 5000, stepGoalComputedOn: addDays(TODAY, -7) };
    const before = resolveStepGoal(plain, days([6000, 6000, 6000, 6000, 6000]), TODAY);
    expect(before.goal).toBe(6000); // the adaptive rule (median x 1.1 = 6600 -> +1000 cap)
  });
});
