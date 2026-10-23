/**
 * i18n wave 3A — the module-private format expressions (inside components, so not
 * importable from a node test). Each case holds the OLD expression verbatim from
 * origin/main fb4adef9 and the NEW fmt call exactly as the component now writes it,
 * and compares them over a grid: numbers 0/1/999/1000/12345.6/negative, and dates
 * across month/year boundaries, Fri/Sat, midnight and the 2026-10-25 DST change,
 * with the zone pinned (CI is UTC, the app is Asia/Jerusalem).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from '../core/fmt';
import { buildRunWeekRows } from '@/features/workout-engine/players/running/utils/run-preview/run-week';

const INTS = [0, 1, 999, 1000, 8400, 10000, 12345, 123456];
const NUMS = [...INTS, 12345.6, -1, -1234.5, 0.4, 12.34];

describe('numbers (he)', () => {
  it("n.toLocaleString('he-IL') -> formatNumber(n, 'he')  [steps, goals, totalReps, walk card]", () => {
    for (const n of NUMS) expect(formatNumber(n, 'he')).toBe(n.toLocaleString('he-IL'));
  });
  it("n.toLocaleString() / ('en-US') on integers -> formatNumber  [coins, XP, steps, calories, step goal]", () => {
    for (const n of INTS) {
      expect(formatNumber(n, 'he')).toBe(n.toLocaleString('en-US'));
      expect(formatNumber(n, 'he')).toBe(n.toLocaleString());
    }
    for (const cal of [0.4, 250.5, 1999.5, 2000.49]) expect(formatNumber(Math.round(cal), 'he')).toBe(Math.round(cal).toLocaleString('en-US'));
  });
});

describe.each(['UTC', 'Asia/Jerusalem'])('dates in %s (he)', (zone) => {
  let prev: string | undefined;
  beforeAll(() => { prev = process.env.TZ; process.env.TZ = zone; });
  afterAll(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; });

  const dates = () => [
    new Date(2026, 0, 1, 0, 0), new Date(2025, 11, 31, 23, 59), new Date(2026, 1, 28, 12), new Date(2026, 2, 1, 0, 0),
    new Date(2026, 9, 23, 18, 30), new Date(2026, 9, 24, 9, 5), new Date(2026, 9, 25, 0, 30), new Date(2026, 9, 25, 12),
    new Date(2026, 9, 26, 0, 0), new Date(2026, 11, 31, 23, 59, 59),
  ];

  it('HistoryTab.formatDateLabel / SummaryHeader (weekday, day, month[, year])', () => {
    for (const d of dates()) {
      expect(formatDate(d, 'he', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
        .toBe(d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      expect(formatDate(d, 'he', { weekday: 'long', day: 'numeric', month: 'long' }))
        .toBe(d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));
    }
  });

  it('ExerciseAnalyticsPage fmtShortDate / fmtLongDate', () => {
    for (const d of dates()) {
      const ms = d.getTime();
      expect(formatDate(new Date(ms), 'he', { day: 'numeric', month: 'numeric' }))
        .toBe(new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' }).format(new Date(ms)));
      expect(formatDate(new Date(ms), 'he', { day: 'numeric', month: 'long', year: 'numeric' }))
        .toBe(new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms)));
    }
  });

  it('RecentActivityList (day, short month) and RunShareBar (2-digit day/month)', () => {
    const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });
    for (const d of dates()) {
      expect(formatDate(d, 'he', { day: 'numeric', month: 'short' })).toBe(DATE_FMT.format(d));
      expect(formatDate(d, 'he', { day: '2-digit', month: '2-digit' }))
        .toBe(new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' }).format(d));
    }
  });

  it('RecentActivityList keeps its Invalid Date -> throws -> caught path', () => {
    expect(() => formatDate(new Date('x'), 'he', { day: 'numeric', month: 'short' })).toThrow(RangeError);
  });
});

describe('run-week row day label (he) — the old `${DAY_LETTERS[i]}׳`', () => {
  const OLD_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const schedule = [1, 2, 3].map((day) => ({ week: 1, day, status: 'pending' }));
  it('training-days branch: every weekday letter', () => {
    for (let i = 0; i < 7; i++) {
      const rows = buildRunWeekRows(schedule.slice(0, 1), 1, [OLD_LETTERS[i]], { isRunDay: false });
      expect(rows[0].dayLetter).toBe(`${OLD_LETTERS[i]}׳`);
    }
  });
  it('by-type placement branch is covered by the existing run-preview tests; the label call is the same weekdayName', () => {
    for (let i = 0; i < 7; i++) expect(`${OLD_LETTERS[i]}׳`).toBe(buildRunWeekRows(schedule.slice(0, 1), 1, [OLD_LETTERS[i]], { isRunDay: false, locale: 'he' })[0].dayLetter);
  });
});
