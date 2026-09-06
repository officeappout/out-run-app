import { describe, it, expect } from 'vitest';
import { calculateVolumeAdjustment } from '../workout-budgeting.utils';

/**
 * Stage 1 of "אימון קל" redefinition (David, 06.09.2026 — docs/workout-engine/
 * 03-CHANGES.md Addendum 25; 00-PLAN.md §17). calculateVolumeAdjustment had a
 * standalone "difficulty===1 → baseSets-1" rule, redundant with
 * DIFFICULTY_VOLUME[1].sets already correctly being {min:3,max:3} — the two
 * stacked (this function's percentage applied multiplicatively back onto the
 * already-correct 3 inside assignVolume), landing D1 sessions at 2 sets
 * instead of 3. Removed. D1 now returns reductionPercent=0 in the base case,
 * same as every other difficulty — inactivity/budget/periodization overrides
 * (separate, independently-returning branches) are confirmed unaffected.
 */

function baseContext(overrides: Record<string, unknown> = {}): any {
  return {
    userLevel: 10,
    daysInactive: 0,
    weeklyBudgetUsagePercent: undefined,
    volumeReductionOverride: undefined,
    periodizationWeek: 1,
    ...overrides,
  };
}

describe('calculateVolumeAdjustment — D1 no longer gets a standalone set reduction', () => {
  it('D1 with no other override: reductionPercent=0, adjustedSets===baseSets (was baseSets-1, ~33%)', () => {
    const result = calculateVolumeAdjustment(baseContext(), 1);
    expect(result.reductionPercent).toBe(0);
    expect(result.adjustedSets).toBe(result.originalSets);
  });

  it('D2 and D3 were already unaffected (control) — still 0 with no override', () => {
    expect(calculateVolumeAdjustment(baseContext(), 2).reductionPercent).toBe(0);
    expect(calculateVolumeAdjustment(baseContext(), 3).reductionPercent).toBe(0);
  });
});

describe('calculateVolumeAdjustment — other reduction reasons are completely unaffected by the D1 removal', () => {
  it('inactivity (>3 days) still reduces by 40%, regardless of difficulty', () => {
    const result1 = calculateVolumeAdjustment(baseContext({ daysInactive: 5 }), 1);
    const result2 = calculateVolumeAdjustment(baseContext({ daysInactive: 5 }), 2);
    expect(result1.reductionPercent).toBe(40);
    expect(result2.reductionPercent).toBe(40);
    expect(result1.reason).toBe('inactivity');
  });

  it('weekly budget >75% still reduces proportionally, regardless of difficulty', () => {
    const result = calculateVolumeAdjustment(baseContext({ weeklyBudgetUsagePercent: 90 }), 1);
    expect(result.reductionPercent).toBeGreaterThan(0);
    expect(result.reason).toBe('weekly_budget');
  });

  it('deload week (W5) still reduces by 50%, regardless of difficulty', () => {
    const result = calculateVolumeAdjustment(baseContext({ periodizationWeek: 5 }), 1);
    expect(result.reductionPercent).toBe(50);
    expect(result.reason).toBe('deload');
  });

  it('peak week (W4) still INCREASES by 20% (negative reductionPercent), regardless of difficulty', () => {
    const result = calculateVolumeAdjustment(baseContext({ periodizationWeek: 4 }), 1);
    expect(result.reductionPercent).toBe(-20);
    expect(result.reason).toBe('peak');
  });

  it('explicit volumeReductionOverride still applies, regardless of difficulty', () => {
    const result = calculateVolumeAdjustment(baseContext({ volumeReductionOverride: 0.25 }), 1);
    expect(result.reductionPercent).toBe(25);
    expect(result.reason).toBe('detraining');
  });
});
