import { describe, it, expect } from 'vitest';
import { derivePeriodizationWeek } from '../periodization.service';

/**
 * Crash regression (09.07.2026): an Invalid Date is truthy, so it passed the
 * !startDate guard and crashed toISOString(). The guard must fall back to
 * Week 1 (Build) — identical semantics to a missing startDate — and never
 * throw, for ANY malformed input.
 */
describe('derivePeriodizationWeek — invalid-date guard', () => {
  it('returns 1 for missing program / startDate', () => {
    expect(derivePeriodizationWeek(null)).toBe(1);
    expect(derivePeriodizationWeek(undefined)).toBe(1);
    expect(derivePeriodizationWeek({} as never)).toBe(1);
  });

  it('does NOT crash on a Firestore-Timestamp-shaped startDate (the original crash)', () => {
    const program = { startDate: { seconds: 1780000000, nanoseconds: 0 } } as never;
    expect(() => derivePeriodizationWeek(program)).not.toThrow();
    expect(derivePeriodizationWeek(program)).toBe(1);
  });

  it('does NOT crash on garbage strings / Invalid Date', () => {
    expect(derivePeriodizationWeek({ startDate: 'not-a-date' } as never)).toBe(1);
    expect(derivePeriodizationWeek({ startDate: new Date('invalid') } as never)).toBe(1);
  });

  it('still computes real weeks for valid dates', () => {
    const today = new Date();
    expect(derivePeriodizationWeek({ startDate: today.toISOString() } as never)).toBe(1);
    const eightDaysAgo = new Date(today.getTime() - 8 * 24 * 3600 * 1000);
    expect(derivePeriodizationWeek({ startDate: eightDaysAgo.toISOString() } as never)).toBe(2);
  });
});
