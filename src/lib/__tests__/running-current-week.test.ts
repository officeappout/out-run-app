import { describe, it, expect } from 'vitest';
import { calculateCurrentWeek, resolveWeekForDate } from '../running-current-week';

const START = new Date('2026-09-06T00:00:00'); // a Sunday

describe('calculateCurrentWeek — unchanged by the extraction', () => {
  it('week 1 for the exact start date', () => {
    expect(calculateCurrentWeek(START, START)).toBe(1);
  });

  it('week 2 exactly 7 days later', () => {
    const asOf = new Date('2026-09-13T00:00:00');
    expect(calculateCurrentWeek(START, asOf)).toBe(2);
  });

  it('still clamps to 1 for a date before start — the documented, deliberately-unfixed behavior', () => {
    const before = new Date('2026-09-01T00:00:00');
    expect(calculateCurrentWeek(START, before)).toBe(1);
  });

  it('defaults asOfDate to now when omitted (no crash, returns a number >= 1)', () => {
    expect(calculateCurrentWeek(START)).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveWeekForDate — the safe API for an arbitrary asOfDate', () => {
  it('a date before startDate returns null, not week 1', () => {
    const before = new Date('2026-09-01T00:00:00');
    expect(resolveWeekForDate(START, before)).toBeNull();
  });

  it('the exact start date returns week 1', () => {
    expect(resolveWeekForDate(START, START)).toBe(1);
  });

  it('a date within the plan returns the correct week', () => {
    const asOf = new Date('2026-09-20T00:00:00'); // 2 weeks later
    expect(resolveWeekForDate(START, asOf)).toBe(3);
  });
});
