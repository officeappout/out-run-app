import { describe, it, expect } from 'vitest';
import { getSmartDefaultDays } from '../running-schedule-smart-defaults';

describe('getSmartDefaultDays', () => {
  it('the real rule: output length always equals the input frequency -- for every legal frequency (2-4), not just the ones with a hand-picked case', () => {
    for (const freq of [2, 3, 4]) {
      expect(getSmartDefaultDays(freq)).toHaveLength(freq);
    }
  });

  it('same length rule holds even for illegal/unexpected input -- the default branch used to violate this (hardcoded [0], correct only for freq=1)', () => {
    for (const freq of [0, 1, 5, 6, 7]) {
      expect(getSmartDefaultDays(freq)).toHaveLength(freq);
    }
  });

  it('freq<=0 returns an empty array, not a crash or a negative-length array', () => {
    expect(getSmartDefaultDays(0)).toEqual([]);
    expect(getSmartDefaultDays(-3)).toEqual([]);
  });

  it('legal frequencies keep their exact hand-picked day choices -- a product decision, not something the length-invariant test should silently change', () => {
    expect(getSmartDefaultDays(2)).toEqual([1, 4]);
    expect(getSmartDefaultDays(3)).toEqual([0, 2, 4]);
    expect(getSmartDefaultDays(4)).toEqual([1, 2, 4, 5]);
  });

  it('every returned index is a valid weekday index (0-6)', () => {
    for (const freq of [1, 2, 3, 4, 5, 6, 7]) {
      for (const dayIndex of getSmartDefaultDays(freq)) {
        expect(dayIndex).toBeGreaterThanOrEqual(0);
        expect(dayIndex).toBeLessThanOrEqual(6);
      }
    }
  });
});
