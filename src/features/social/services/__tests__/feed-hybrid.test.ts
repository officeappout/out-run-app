import { describe, expect, it } from 'vitest';
import { hybridCreditByCategory, postActivityCredit, postCreditForCategory } from '../feed-hybrid';

const parts = { runKm: 2, walkKm: 1, runMinutes: 12, walkMinutes: 10, strengthMinutes: 15, strengthSets: 9 };

describe('feed-hybrid', () => {
  it('solo posts keep minutes × multiplier', () => {
    expect(postActivityCredit({ activityCategory: 'strength', durationMinutes: 30 })).toBe(60);
    expect(postActivityCredit({ activityCategory: 'cardio', durationMinutes: 30 })).toBe(30);
    expect(postActivityCredit({ activityCategory: 'maintenance', durationMinutes: 30 })).toBe(30);
  });

  it('a hybrid post is credited per part (aerobic ×1 + strength ×2)', () => {
    expect(hybridCreditByCategory(parts)).toEqual({ cardio: 22, strength: 30 });
    expect(postActivityCredit({ activityCategory: 'cardio', durationMinutes: 37, hybridParts: parts })).toBe(52);
  });

  it('category boards count only the hybrid post\'s own part; other posts unchanged', () => {
    const hybrid = { activityCredit: 52, hybridParts: parts };
    expect(postCreditForCategory(hybrid, 'overall')).toBe(52);
    expect(postCreditForCategory(hybrid, null)).toBe(52);
    expect(postCreditForCategory(hybrid, 'cardio')).toBe(22);
    expect(postCreditForCategory(hybrid, 'strength')).toBe(30);
    expect(postCreditForCategory({ activityCredit: 40 }, 'cardio')).toBe(40);
  });
});
