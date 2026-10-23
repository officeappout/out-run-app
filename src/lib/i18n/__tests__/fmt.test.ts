/**
 * i18n wave 3A — core/fmt.ts parity. The oracle is today's behaviour: the
 * hand-written Hebrew arrays and the 'he-IL' Intl/toLocale* calls the app used.
 * The clock and the zone are pinned (the CI runner is UTC, the app runs in
 * Asia/Jerusalem — both must give the same answers for these functions).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatDayMonth, formatNumber, formatTime, monthName, weekdayName } from '../core/fmt';

const ZONES = ['UTC', 'Asia/Jerusalem'] as const;

// Verbatim from the pre-wave-3A call sites (origin/main fb4adef9).
const MONTHS_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']; // record-tiles.ts, RollingAgenda.tsx
const MONTHS_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']; // exercise-analytics.utils.ts
const WEEKDAYS_NARROW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // exercise-analytics.utils.ts

const NUMBERS = [0, 1, 999, 1000, 12345.6, -1, -1234.5, 10000, 1234567.891, 0.4, 12.34];

describe('monthName / weekdayName (he) equal the hand-written arrays', () => {
  it('long month', () => MONTHS_LONG.forEach((n, i) => expect(monthName(i, 'he')).toBe(n)));
  it('short month', () => MONTHS_SHORT.forEach((n, i) => expect(monthName(i, 'he', 'short')).toBe(n)));
  it('narrow weekday', () => WEEKDAYS_NARROW.forEach((n, i) => expect(weekdayName(i, 'he', 'narrow')).toBe(n)));
  it('wraps the index', () => {
    expect(monthName(12, 'he')).toBe('ינואר');
    expect(monthName(-1, 'he')).toBe('דצמבר');
  });
  it('other languages get their own names', () => {
    expect(monthName(2, 'en')).toBe('March');
    expect(monthName(2, 'de')).toBe('März');
  });
});

describe('formatNumber (he) equals toLocaleString("he-IL")', () => {
  it.each(NUMBERS)('%s', (n) => {
    expect(formatNumber(n, 'he')).toBe(n.toLocaleString('he-IL'));
    expect(formatNumber(n, 'he', { maximumFractionDigits: 1 })).toBe(n.toLocaleString('he-IL', { maximumFractionDigits: 1 }));
  });
  it('integers: he-IL equals en-US and the device default (the places that used those)', () => {
    for (const n of [0, 1, 999, 1000, 8400, 10000, 123456]) {
      expect(formatNumber(n, 'he')).toBe(n.toLocaleString('en-US'));
      expect(formatNumber(n, 'he')).toBe(n.toLocaleString('he-IL'));
    }
  });
});

describe.each(ZONES)('dates in %s', (zone) => {
  let prev: string | undefined;
  beforeAll(() => { prev = process.env.TZ; process.env.TZ = zone; });
  afterAll(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; });

  // Month/year boundaries, Fri/Sat, midnight, the 2026-10-25 DST change in Asia/Jerusalem.
  const makeDates = (): Date[] => [
    new Date(2026, 0, 1, 0, 0), new Date(2025, 11, 31, 23, 59), new Date(2026, 1, 28, 12, 0), new Date(2026, 2, 1, 0, 0),
    new Date(2026, 9, 23, 18, 30), new Date(2026, 9, 24, 9, 5), new Date(2026, 9, 25, 0, 30), new Date(2026, 9, 25, 12, 0),
    new Date(2026, 9, 26, 0, 0), new Date(2026, 11, 31, 23, 59, 59),
  ];

  it('formatDate / formatTime (he) equal Intl he-IL', () => {
    for (const d of makeDates()) {
      for (const o of [{ day: 'numeric', month: 'long', year: 'numeric' }, { day: 'numeric', month: 'numeric' }, { day: 'numeric', month: 'short' }, { weekday: 'long', day: 'numeric', month: 'long' }] as Intl.DateTimeFormatOptions[]) {
        expect(formatDate(d, 'he', o)).toBe(new Intl.DateTimeFormat('he-IL', o).format(d));
        expect(formatDate(d, 'he', o)).toBe(d.toLocaleDateString('he-IL', o));
      }
      expect(formatTime(d, 'he')).toBe(d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
    }
  });

  it('formatDayMonth (he) equals `${getDate()} ${MONTHS[getMonth()]}`', () => {
    for (const d of makeDates()) expect(formatDayMonth(d, 'he')).toBe(`${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`);
  });

  it('formatDateRange (he) equals the old planner label', () => {
    const old = (start: Date, end: Date) => {
      const startMonth = MONTHS_LONG[start.getMonth()];
      const endMonth = MONTHS_LONG[end.getMonth()];
      return startMonth === endMonth
        ? `${start.getDate()}–${end.getDate()} ${startMonth}`
        : `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth}`;
    };
    for (const sunday of [new Date(2026, 9, 18), new Date(2026, 9, 25), new Date(2026, 11, 27), new Date(2026, 1, 22), new Date(2026, 2, 1)]) {
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      expect(formatDateRange(sunday, saturday, 'he')).toBe(old(sunday, saturday));
    }
  });

  it('other languages produce a range / day-month in their own form', () => {
    expect(formatDayMonth(new Date(2026, 2, 15), 'en')).toBe('March 15');
    expect(formatDateRange(new Date(2026, 9, 18), new Date(2026, 9, 24), 'en')).toMatch(/Oct/);
  });
});
