import { describe, it, expect } from 'vitest';
import { getSmartDefaultDays, pickRunDaysAvoidingStrength } from '../running-schedule-smart-defaults';

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

describe('pickRunDaysAvoidingStrength', () => {
  const circularGaps = (days: number[]) =>
    days.map((d, i) => (i === days.length - 1 ? days[0] + 7 - d : days[i + 1] - d));

  it('no strength days -> exactly getSmartDefaultDays (pure-runner default unchanged)', () => {
    for (const n of [2, 3, 4, 5]) {
      expect(pickRunDaysAvoidingStrength(n, [])).toEqual(getSmartDefaultDays(n));
    }
  });

  it('N=2..5: never overlaps strength days when the week has room, length always N, sorted & unique', () => {
    const strengthSets = [[0], [1, 4], [0, 2, 4], [1, 3, 5], [6], [0, 6]];
    for (const strength of strengthSets) {
      for (const n of [2, 3, 4, 5]) {
        if (n + strength.length > 7) continue;
        const days = pickRunDaysAvoidingStrength(n, strength);
        expect(days).toHaveLength(n);
        expect(new Set(days).size).toBe(n);
        expect([...days].sort((a, b) => a - b)).toEqual(days);
        expect(days.filter((d) => strength.includes(d))).toEqual([]);
      }
    }
  });

  it('spread: Sun/Tue/Thu strength, 3 runs -> Mon/Wed/Fri (no two runs back to back)', () => {
    expect(pickRunDaysAvoidingStrength(3, [0, 2, 4])).toEqual([1, 3, 5]);
  });

  it('spread: Mon/Thu strength, 2 runs -> gaps as even as the free days allow (3+4)', () => {
    const days = pickRunDaysAvoidingStrength(2, [1, 4]);
    expect(circularGaps(days).sort()).toEqual([3, 4]);
  });

  it('spread: with one strength day, N=2..5 never yields a worse max gap than necessary', () => {
    for (const n of [2, 3, 4, 5]) {
      const days = pickRunDaysAvoidingStrength(n, [3]);
      const maxGap = Math.max(...circularGaps(days));
      expect(maxGap).toBeLessThanOrEqual(Math.ceil(7 / n) + 1);
    }
  });

  it('fallback: not enough free days -> minimal overlap (uses every free day first)', () => {
    // Strength on 4 days, 5 runs: 3 free days, so exactly 2 overlaps.
    const strength = [0, 2, 4, 6];
    const days = pickRunDaysAvoidingStrength(5, strength);
    expect(days).toHaveLength(5);
    expect(days).toEqual(expect.arrayContaining([1, 3, 5]));
    expect(days.filter((d) => strength.includes(d))).toHaveLength(2);
  });

  it('fallback: strength every day -> still N days (all overlap), spread evenly', () => {
    const days = pickRunDaysAvoidingStrength(3, [0, 1, 2, 3, 4, 5, 6]);
    expect(days).toHaveLength(3);
    expect(Math.max(...circularGaps(days))).toBe(3);
  });

  it('ignores invalid strength indices and clamps N', () => {
    expect(pickRunDaysAvoidingStrength(3, [-1, 9, 2.5])).toEqual(getSmartDefaultDays(3));
    expect(pickRunDaysAvoidingStrength(0, [1])).toEqual([]);
    expect(pickRunDaysAvoidingStrength(7, [1])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('deterministic: same input -> same output', () => {
    expect(pickRunDaysAvoidingStrength(4, [2])).toEqual(pickRunDaysAvoidingStrength(4, [2]));
  });
});

describe('pickRunDaysAvoidingStrength — avoidDays (Shabbat, enable_home_v2)', () => {
  it('no avoidDays → exactly the previous picks', () => {
    for (let f = 2; f <= 4; f++) {
      for (const strength of [[], [0, 2, 4], [1, 3, 5], [0, 1, 2, 3]]) {
        expect(pickRunDaysAvoidingStrength(f, strength, [])).toEqual(pickRunDaysAvoidingStrength(f, strength));
      }
    }
  });

  it('never Saturday when avoided and another choice exists', () => {
    for (let f = 2; f <= 6; f++) {
      for (const strength of [[], [0, 2, 4], [1, 3, 5], [0, 1, 2, 3, 4]]) {
        const days = pickRunDaysAvoidingStrength(f, strength, [6]);
        expect(days).toHaveLength(f);
        expect(days).not.toContain(6);
      }
    }
  });

  it('keeps the length when every day is needed', () => {
    expect(pickRunDaysAvoidingStrength(7, [], [6])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
