import { describe, it, expect } from 'vitest';
import { isDateWithinRunningPlan } from '../running-plan-date-range';

describe('isDateWithinRunningPlan', () => {
  it('the exact registration day itself counts as within range (day 0)', () => {
    expect(isDateWithinRunningPlan('2026-09-02', new Date('2026-09-02T00:00:00'))).toBe(true);
  });

  it('a date after startDate is within range', () => {
    expect(isDateWithinRunningPlan('2026-09-02', new Date('2026-09-06T00:00:00'))).toBe(true);
    expect(isDateWithinRunningPlan('2026-09-02', new Date('2027-01-01T00:00:00'))).toBe(true);
  });

  it('a date before startDate is NOT within range -- the exact case the clamp used to hide', () => {
    expect(isDateWithinRunningPlan('2026-09-02', new Date('2026-08-30T00:00:00'))).toBe(false);
    expect(isDateWithinRunningPlan('2026-09-02', new Date('2026-09-01T00:00:00'))).toBe(false);
  });

  it('ignores time-of-day -- only the calendar day matters, matching calculateCurrentWeek\'s own normalization', () => {
    expect(isDateWithinRunningPlan('2026-09-02T23:59:00', new Date('2026-09-02T00:01:00'))).toBe(true);
    expect(isDateWithinRunningPlan('2026-09-02T00:01:00', new Date('2026-09-01T23:59:00'))).toBe(false);
  });

  it('accepts startDate as a Date object, an ISO string, or a numeric timestamp', () => {
    const asOfDate = new Date('2026-09-06T00:00:00');
    const iso = '2026-09-02T10:00:00.000Z';
    const dateObj = new Date(iso);
    expect(isDateWithinRunningPlan(iso, asOfDate)).toBe(true);
    expect(isDateWithinRunningPlan(dateObj, asOfDate)).toBe(true);
    expect(isDateWithinRunningPlan(dateObj.getTime(), asOfDate)).toBe(true);
  });
});
