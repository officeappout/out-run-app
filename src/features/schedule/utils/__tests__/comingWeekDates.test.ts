import { describe, expect, it } from 'vitest';
import { comingDayOfMonthByDow, comingWeek, localIsoDate } from '../comingWeekDates';

describe('comingWeek', () => {
  it('starts today and runs 7 days across a month end', () => {
    const wed = new Date(2026, 9, 28, 22, 30); // Wed 28.10.2026
    const week = comingWeek(wed);
    expect(week.map((d) => d.dow)).toEqual([3, 4, 5, 6, 0, 1, 2]);
    expect(week[0].iso).toBe('2026-10-28');
    expect(week[4]).toEqual({ dow: 0, iso: '2026-11-01', dayOfMonth: 1 });
  });

  it('day of month by weekday, Sunday first', () => {
    expect(comingDayOfMonthByDow(new Date(2026, 9, 28))).toEqual([1, 2, 3, 28, 29, 30, 31]);
  });

  it('local date, never UTC-shifted', () => {
    expect(localIsoDate(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});
