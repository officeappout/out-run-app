import { describe, expect, it } from 'vitest';
import {
  STRENGTH_DONE_MIN_SETS,
  strengthCompletionSnapshot,
  strengthDayGoalMet,
  strengthDoneThreshold,
} from '../strength-day-gate';

describe('strength-day-gate', () => {
  it('tiers: ⅔ of the target, never under 4', () => {
    expect(STRENGTH_DONE_MIN_SETS).toBe(4);
    expect(strengthDoneThreshold(12)).toBe(8);
    expect(strengthDoneThreshold(10)).toBe(7); // ceil(6.67)
    expect(strengthDoneThreshold(3)).toBe(4); // floor wins
    expect(strengthDoneThreshold(0)).toBe(4); // rest day / no budget
  });
  it('legacy: ⅔ of the target, no target = always met', () => {
    expect(strengthDoneThreshold(12, 'legacy')).toBe(8);
    expect(strengthDoneThreshold(0, 'legacy')).toBe(0);
    expect(strengthDayGoalMet(0, 0, 'legacy')).toBe(true);
  });
  it('1–2 sets are never done; the bar is inclusive', () => {
    expect(strengthDayGoalMet(2, 12)).toBe(false);
    expect(strengthDayGoalMet(7, 12)).toBe(false);
    expect(strengthDayGoalMet(8, 12)).toBe(true);
    expect(strengthDayGoalMet(3, 0)).toBe(false);
    expect(strengthDayGoalMet(4, 0)).toBe(true);
  });
  it('snapshot keeps the persisted shape', () => {
    expect(strengthCompletionSnapshot(12, 6, 'tiers')).toEqual({ targetSets: 12, completedSets: 6, pct: 0.5, met: false });
    expect(strengthCompletionSnapshot(0, 2, 'legacy')).toEqual({ targetSets: 0, completedSets: 2, pct: 1, met: true });
    expect(strengthCompletionSnapshot(0, 2, 'tiers').met).toBe(false);
    expect(strengthCompletionSnapshot(9, 20, 'tiers').pct).toBe(1);
  });
  it('junk input reads as 0', () => {
    expect(strengthDayGoalMet(Number.NaN, 12)).toBe(false);
    expect(strengthDoneThreshold(-5)).toBe(4);
  });
});
