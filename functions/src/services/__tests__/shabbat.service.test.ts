import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isShabbatOrYomTov, isYomTovDate, YOM_TOV_FALLBACK_DATES } from '../shabbat.service';

/**
 * Owner decision 17.10.2026 — no pushes on Shabbat / yom tov. Window:
 * (rest day − 1) 14:00 → rest day 20:30, Asia/Jerusalem wall-clock.
 * Instants are written in UTC with the Israel offset noted (+2 winter, +3 summer).
 */
describe('isShabbatOrYomTov — Shabbat', () => {
  it('a weekday is not blocked', () => {
    // Wed 13.01.2027 12:00 Israel (+2)
    expect(isShabbatOrYomTov(new Date('2027-01-13T10:00:00Z'))).toBe(false);
  });

  it('Friday before 14:00 is not blocked, from 14:00 it is', () => {
    // Fri 15.01.2027 13:59 / 14:00 Israel (+2)
    expect(isShabbatOrYomTov(new Date('2027-01-15T11:59:00Z'))).toBe(false);
    expect(isShabbatOrYomTov(new Date('2027-01-15T12:00:00Z'))).toBe(true);
  });

  it('Friday night and Saturday daytime are blocked', () => {
    expect(isShabbatOrYomTov(new Date('2027-01-15T20:00:00Z'))).toBe(true); // Fri 22:00
    expect(isShabbatOrYomTov(new Date('2027-01-16T10:00:00Z'))).toBe(true); // Sat 12:00
  });

  it('Saturday night after havdalah (20:30) is open again', () => {
    expect(isShabbatOrYomTov(new Date('2027-01-16T18:29:00Z'))).toBe(true); // Sat 20:29
    expect(isShabbatOrYomTov(new Date('2027-01-16T18:30:00Z'))).toBe(false); // Sat 20:30
    expect(isShabbatOrYomTov(new Date('2027-01-16T19:30:00Z'))).toBe(false); // Sat 21:30
  });

  it('summer (UTC+3) uses Israel wall-clock, not UTC', () => {
    // Sat 10.07.2027 20:15 Israel (+3) = 17:15Z → still Shabbat
    expect(isShabbatOrYomTov(new Date('2027-07-10T17:15:00Z'))).toBe(true);
    // Sat 10.07.2027 20:45 Israel = 17:45Z → over
    expect(isShabbatOrYomTov(new Date('2027-07-10T17:45:00Z'))).toBe(false);
  });
});

describe('isShabbatOrYomTov — yom tov', () => {
  it('Pesach 5787 (Thu 22.04.2027): erev from 14:00, the day until 20:30', () => {
    expect(isShabbatOrYomTov(new Date('2027-04-21T07:00:00Z'))).toBe(false); // Wed 10:00
    expect(isShabbatOrYomTov(new Date('2027-04-21T12:00:00Z'))).toBe(true); // Wed 15:00 (erev)
    expect(isShabbatOrYomTov(new Date('2027-04-22T09:00:00Z'))).toBe(true); // Thu 12:00
    expect(isShabbatOrYomTov(new Date('2027-04-22T18:00:00Z'))).toBe(false); // Thu 21:00
  });

  it('Yom Kippur 5788 (Mon 11.10.2027) — Sunday evening blocked', () => {
    expect(isShabbatOrYomTov(new Date('2027-10-10T15:00:00Z'))).toBe(true); // Sun 18:00 (+3)
    expect(isShabbatOrYomTov(new Date('2027-10-11T12:00:00Z'))).toBe(true); // Mon 15:00
  });

  it('Shabbat chained into Rosh Hashana day 2 (Sat–Sun 2–3.10.2027) stays blocked Saturday night', () => {
    expect(isShabbatOrYomTov(new Date('2027-10-02T18:00:00Z'))).toBe(true); // Sat 21:00 (+3)
    expect(isShabbatOrYomTov(new Date('2027-10-03T18:00:00Z'))).toBe(false); // Sun 21:00
  });

  it('chol hamoed is NOT yom tov', () => {
    expect(isShabbatOrYomTov(new Date('2027-04-25T09:00:00Z'))).toBe(false); // Sun 25.04.2027 12:00
  });

  it('ICU Hebrew calendar and the hardcoded fallback table agree, day by day, 5787–5789', () => {
    for (const d of YOM_TOV_FALLBACK_DATES) {
      expect(isYomTovDate(d, true), d).toBe(true);
    }
    const start = Date.UTC(2026, 8, 1, 12);
    const end = Date.UTC(2029, 5, 1, 12);
    for (let t = start; t <= end; t += 86_400_000) {
      const key = new Date(t).toISOString().slice(0, 10);
      expect(isYomTovDate(key, true), key).toBe(isYomTovDate(key, false));
    }
  });

  it('the fallback table alone still blocks a yom tov', () => {
    expect(isShabbatOrYomTov(new Date('2028-05-31T09:00:00Z'), false)).toBe(true); // Shavuot 5788, Wed
  });
});
