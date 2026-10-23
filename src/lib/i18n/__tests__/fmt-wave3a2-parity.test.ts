/**
 * i18n wave 3A part 2 — parity of every call site that moved from `toLocale*('he-IL')` to `fmt.*`.
 *
 * `fixtures/fmt-wave3a2-before.json` was recorded from UNMODIFIED origin/main (RECORD_FMT_PARITY=1);
 * this test replays the same inputs against the migrated code and requires byte-identical output.
 * The clock and the time zone are pinned: CI runs in UTC, the app in Asia/Jerusalem (PR #744), and the
 * grid crosses the 2026-10-25 DST change, month/year boundaries, Friday/Saturday and midnight.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatLeaderboardScore, type LeaderboardMode } from '@/features/arena/components/format-leaderboard-score';
import { formatKm as leagueFormatKm } from '@/features/arena/components/league-board-logic';
import { formatSessionDate } from '@/features/arena/components/group-details/utils/group-details-logic';
import {
  formatCount, formatKm as hubFormatKm, formatMinutes, isoDayLabel, monthName, monthShort, relativeDay, weekRangeLabel,
} from '@/features/progression-hub/v2/utils/progress-format';
import { consistencyDay, missedLine } from '@/features/progression-hub/v2/utils/consistency-days';
import { formatDate as parkFormatDate, sessionRowTimeLabel } from '@/features/parks/client/components/park-detail/utils/park-detail-format';
import { formatDateHebrew, formatDateTimeHebrew } from '@/lib/utils/date-formatter';
import { walkPieceSubtitle, walkStepsHint } from '@/features/schedule/walking/walkWeekView';
import { resolveNotificationText, resolveDescription, resolveContentTags } from '@/features/content/branding/core/branding.utils';
import { makeT } from '@/lib/i18n/t';
import { formatDate, formatNumber } from '@/lib/i18n/core/fmt';
import { formatDateLoose, monthLabel } from '@/lib/i18n/fmt-display';
import { WEEKDAY_SHORT } from '@/features/progression-hub/v2/utils/progress-format';
import { community } from '@/messages/ns/community';

const FIXTURE = path.resolve(__dirname, 'fixtures/fmt-wave3a2-before.json');
const RECORD = process.env.RECORD_FMT_PARITY === '1';
const originalTz = process.env.TZ;

const NUMBERS = [0, 1, -1, 7, 99, 99.95, 100, 999, 1000, 1234, 12345.6, -1234.5, 0.04, 0.4, 1.0, 12.34, 59.99, 1e6, 1234567.89];
const DATES = [
  '2026-01-01T00:00:00', '2026-01-31T23:59:59', '2026-02-28T12:00:00', '2025-12-31T23:59:59', '2026-03-27T09:05:00',
  '2026-10-23T21:30:00', '2026-10-24T08:00:00', '2026-10-25T00:00:00', '2026-10-25T01:30:00', '2026-10-25T23:59:00',
  '2026-10-26T00:00:00', '2026-12-31T23:59:59', '2027-01-01T00:00:00',
];
const NOW = new Date('2026-10-24T10:00:00+03:00'); // Saturday

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const record = (key: string, fn: () => unknown) => {
    try { out[key] = fn(); } catch (e) { out[key] = `THROWS ${(e as Error).constructor.name}`; }
  };
  const tHe = makeT('he', community);
  for (const n of NUMBERS) {
    for (const mode of ['general', 'steps', 'distance', 'running', 'strength', 'other'] as LeaderboardMode[]) {
      record(`leaderboard ${mode} ${n}`, () => formatLeaderboardScore(n, mode, false));
    }
    record(`leaderboard pace ${n}`, () => formatLeaderboardScore(n, 'running', true));
    record(`leagueKm ${n}`, () => leagueFormatKm(n));
    record(`hubKm ${n}`, () => hubFormatKm(n));
    record(`hubCount ${n}`, () => formatCount(n));
    record(`hubMinutes ${n}`, () => formatMinutes(n));
    record(`walkSubtitle ${n}`, () => walkPieceSubtitle({ isLong: false, target: { type: 'time', minutes: 30 }, estSteps: n } as never));
    record(`walkHint ${n}`, () => walkStepsHint(n, 10000, 3300));
    record(`walkHint2 ${n}`, () => walkStepsHint(n, 5000, 1000));
    record(`consistencyDay ${n}`, () => {
      const wk = [
        { id: 'a', kind: 'strength', type: 'strength', minutes: n, km: 0, pace: 0, sets: 1, domainSets: {}, date: new Date(2026, 9, 21) },
        { id: 'b', kind: 'run', type: 'running', minutes: 20, km: n, pace: 0, sets: 0, domainSets: {}, date: new Date(2026, 9, 21) },
        { id: 'c', kind: 'walk', type: 'walking', minutes: n, km: 0, pace: 0, sets: 0, domainSets: {}, date: new Date(2026, 9, 21) },
      ];
      const day = { date: '2026-10-21', steps: n * 100, stepsGoal: 8000, distanceMeters: 0, activeMinutes: n, minutesByCategory: { strength: 0, cardio: 0, maintenance: n } };
      const d = consistencyDay('2026-10-21', new Date(2026, 9, 21), wk as never, day as never, '2026-10-21');
      return { reasons: d.reasons, minutes: d.minutes, missed: missedLine(d) };
    });
    record(`brandingOvertake ${n}`, () =>
      resolveNotificationText('@פער_צעדים', { triggerType: 'League_Overtake', stepDelta: n } as never));
    record(`brandingStepsLeft ${n}`, () => [
      resolveDescription('@צעדים_שנותרו', { stepsLeft: n } as never),
      resolveContentTags('@צעדים_שנותרו', { stepsLeft: n } as never),
    ]);
  }
  record('leagueKm null', () => leagueFormatKm(null));
  record('leagueKm NaN', () => leagueFormatKm(Number.NaN));
  record('leaderboard NaN', () => formatLeaderboardScore(Number.NaN, 'steps'));
  record('brandingOvertake none', () => resolveNotificationText('@פער_צעדים', { triggerType: 'League_Overtake' } as never));

  for (const iso of DATES) {
    const d = new Date(iso);
    record(`parkFormatDate ${iso}`, () => parkFormatDate(d));
    record(`parkFormatDate str ${iso}`, () => parkFormatDate(iso));
    record(`parkFormatDate ts ${iso}`, () => parkFormatDate({ toDate: () => d }));
    record(`dateHe ${iso}`, () => formatDateHebrew(d));
    record(`dateTimeHe ${iso}`, () => formatDateTimeHebrew(d));
    record(`sessionRow ${iso}`, () => sessionRowTimeLabel(iso, NOW));
    record(`sessionDateGroup ${iso}`, () => formatSessionDate(iso.slice(0, 10), '19:00', tHe as never));
    record(`hubMonth ${iso}`, () => [monthName(d.getMonth()), monthShort(d.getMonth()), weekRangeLabel(d, new Date(d.getTime() + 6 * 864e5)), relativeDay(d, NOW), isoDayLabel(iso.slice(0, 10))]);
  }
  for (const bad of ['', null, undefined, 'garbage', Number.NaN]) {
    record(`parkFormatDate bad ${String(bad)}`, () => parkFormatDate(bad));
    record(`sessionRow bad ${String(bad)}`, () => sessionRowTimeLabel(bad as never, NOW));
  }
  record('dateHe invalid', () => formatDateHebrew(new Date('x')));
  record('dateHe null', () => formatDateHebrew(null));
  return out;
}

describe('wave 3A part 2 — call-site parity (Asia/Jerusalem, pinned clock)', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Jerusalem';
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
  });

  it(RECORD ? 'records the BEFORE snapshot' : 'matches the snapshot recorded from origin/main', () => {
    const now = snapshot();
    if (RECORD) {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(now)).toEqual(Object.keys(before));
    const diffs = Object.keys(before).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(before[k]));
    expect(diffs.map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(now[k])}`)).toEqual([]);
  });
});

/**
 * The new fmt-based expressions against the old ones they replaced, over a grid. `Intl` 'he-IL' is the oracle
 * (the old code was `x.toLocaleString('he-IL', …)` / `d.toLocaleDateString('he-IL', …)` / literal name arrays).
 */
describe('wave 3A part 2 — fmt vs the old expressions (oracle: Intl he-IL)', () => {
  beforeAll(() => { process.env.TZ = 'Asia/Jerusalem'; });
  afterAll(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });

  it('formatNumber(n, he) === n.toLocaleString("he-IL") with and without options', () => {
    for (const n of [...NUMBERS, Number.NaN, Infinity, -0, 0.5, 2.5, 1e21, 123456789.987]) {
      expect(formatNumber(n, 'he')).toBe(n.toLocaleString('he-IL'));
      expect(formatNumber(n, 'he', { maximumFractionDigits: 1 })).toBe(n.toLocaleString('he-IL', { maximumFractionDigits: 1 }));
      expect(formatNumber(Math.round(n * 10) / 10, 'he', { maximumFractionDigits: 1 }))
        .toBe((Math.round(n * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 }));
    }
  });

  const OPTION_SETS: Intl.DateTimeFormatOptions[] = [
    { day: 'numeric', month: 'short' },
    { day: 'numeric', month: 'short', year: 'numeric' },
    { day: '2-digit', month: '2-digit' },
    { day: 'numeric', month: 'numeric' },
    { weekday: 'short' },
    { weekday: 'long' },
    { weekday: 'short', day: 'numeric', month: 'short' },
    { weekday: 'long', day: 'numeric', month: 'long' },
    { day: 'numeric' },
    { month: 'short' },
    { day: '2-digit', month: '2-digit', year: 'numeric' },
  ];
  const GRID = [...DATES, '2026-03-27T23:59:59', '2026-03-28T00:00:00', '2024-02-29T12:00:00'].map((d) => new Date(d));

  it('formatDateLoose(d, he, opts) === d.toLocaleDateString("he-IL", opts), including Invalid Date', () => {
    for (const d of [...GRID, new Date('nope')]) {
      for (const opts of OPTION_SETS) {
        expect(formatDateLoose(d, 'he', opts)).toBe(d.toLocaleDateString('he-IL', opts));
      }
    }
  });

  it('formatDate(d, he, date+time opts) === d.toLocaleString("he-IL", opts) (the formatDateTimeHebrew shape)', () => {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    for (const d of GRID) expect(formatDate(d, 'he', opts)).toBe(d.toLocaleString('he-IL', opts));
  });

  it('monthLabel reproduces the old Hebrew month arrays, wraps like the old modulo', () => {
    const SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
    const LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    for (let m = -13; m < 26; m++) {
      expect(monthLabel(m, 'he', 'short')).toBe(SHORT[((m % 12) + 12) % 12]);
      expect(monthLabel(m, 'he', 'long')).toBe(LONG[((m % 12) + 12) % 12]);
    }
  });

  it('WEEKDAY_SHORT is the old literal list', () => {
    expect(WEEKDAY_SHORT).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']);
  });

  it('other locales produce something different from Hebrew (the helpers really take the locale)', () => {
    expect(monthLabel(9, 'en', 'long')).toBe('October');
    expect(formatNumber(1234.5, 'de')).toBe('1.234,5');
    expect(formatDateLoose(new Date(2026, 9, 25), 'en', { weekday: 'long' })).toBe('Sunday');
  });
});
