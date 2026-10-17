/**
 * shabbat.service — "is it Shabbat or a yom tov in Israel right now?"
 *
 * Owner decision (17.10.2026): NO pushes on Shabbat or on Jewish holidays
 * (yom tov). Used by push.service.ts's sendPush() and by the three legacy
 * direct-FCM paths (sendPushFromQueue, chatMessageNotification,
 * onboardingDropoffDispatcher). Exemptions (the `system` channel, 1:1 chat
 * between two people) are decided by the CALLERS, not here — this module only
 * answers the calendar question.
 *
 * WINDOW (conservative fixed window, Asia/Jerusalem wall-clock)
 * ─────────────────────────────────────────────────────────────
 * A "rest day" is a Saturday or a yom tov day. The blocked window around a
 * rest day D is:
 *     (D − 1) 14:00  →  D 20:30
 * i.e. from Friday/erev-chag 14:00 (always before candle-lighting anywhere in
 * Israel, all year) until 20:30 on the day itself (at or after havdalah all
 * year; the summer-solstice havdalah is the latest, ~20:25–20:30). Consecutive
 * rest days (two-day Rosh Hashana, a yom tov on Friday, or one on Sunday)
 * chain into one continuous window because "D 20:30" of the first day is
 * already covered by "(D+1 − 1) 14:00" of the next.
 *
 * Exact candle-lighting/havdalah times (@hebcal/core) were considered and NOT
 * used: functions/node_modules is shared (symlinked) with the main checkout,
 * so adding a dependency safely wasn't possible in this change, and the fixed
 * window errs on the side of silence. In winter this blocks ~3h after
 * havdalah on Saturday night that strictly didn't need to be — acceptable.
 *
 * YOM TOV DAYS (Israel — one day each, no second-day yom tov except RH):
 *   Rosh Hashana 1–2 Tishri · Yom Kippur 10 Tishri · Sukkot 15 Tishri ·
 *   Shemini Atzeret/Simchat Torah 22 Tishri · Pesach 15 + 21 Nisan ·
 *   Shavuot 6 Sivan.
 * Computed with the runtime's built-in ICU Hebrew calendar (`Intl`, no
 * dependency, never expires). A load-time self-check verifies that ICU
 * actually returns Hebrew dates (a small-ICU runtime silently falls back to
 * Gregorian); if it doesn't, a hardcoded table (5787–5789, i.e. through
 * Shavuot 2029) is used instead and a warning is logged.
 */

import { logger } from 'firebase-functions';

const TZ = 'Asia/Jerusalem';

/** Erev Shabbat / erev chag — blocked from this local time on the day BEFORE a rest day. */
export const SHABBAT_START_MINUTES = 14 * 60; // 14:00
/** Blocked on the rest day itself until this local time (≥ havdalah, all year). */
export const SHABBAT_END_MINUTES = 20 * 60 + 30; // 20:30

/** [hebrewMonthName (ICU 'en' long name), day] pairs that are yom tov in Israel. */
const YOM_TOV_HEBREW_DATES: ReadonlyArray<readonly [string, number]> = [
  ['Tishri', 1],
  ['Tishri', 2],
  ['Tishri', 10],
  ['Tishri', 15],
  ['Tishri', 22],
  ['Nisan', 15],
  ['Nisan', 21],
  ['Sivan', 6],
];

/**
 * Fallback only (see header) — the same days as YOM_TOV_HEBREW_DATES as
 * Gregorian dates, Rosh Hashana 5787 → Shavuot 5789. Cross-checked against
 * the ICU computation in shabbat.service.test.ts.
 */
export const YOM_TOV_FALLBACK_DATES: ReadonlySet<string> = new Set([
  // 5787
  '2026-09-12', '2026-09-13', '2026-09-21', '2026-09-26', '2026-10-03',
  '2027-04-22', '2027-04-28', '2027-06-11',
  // 5788
  '2027-10-02', '2027-10-03', '2027-10-11', '2027-10-16', '2027-10-23',
  '2028-04-11', '2028-04-17', '2028-05-31',
  // 5789
  '2028-09-21', '2028-09-22', '2028-09-30', '2028-10-05', '2028-10-12',
  '2029-03-31', '2029-04-06', '2029-05-20',
]);

const localPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Formats a Gregorian civil date (passed as noon UTC) as a Hebrew date. ICU
// maps a civil day to the Hebrew date that is current at its midnight, which
// is what we want: the "day" of a yom tov, with erev handled by the window.
const hebrewFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
});

interface LocalParts {
  year: number;
  month: number;
  day: number;
  minutes: number; // minutes since local midnight
}

function jerusalemParts(now: Date): LocalParts {
  const parts = localPartsFmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    minutes: get('hour') * 60 + get('minute'),
  };
}

function hebrewMonthDay(civilNoonUtc: Date): { month: string; day: number } {
  const parts = hebrewFmt.formatToParts(civilNoonUtc);
  return {
    month: parts.find((p) => p.type === 'month')?.value ?? '',
    day: Number(parts.find((p) => p.type === 'day')?.value ?? '0'),
  };
}

/** Load-time check: does this runtime's ICU actually do the Hebrew calendar? */
const ICU_HEBREW_OK: boolean = (() => {
  try {
    // 2026-09-12 = 1 Tishri 5787 (Rosh Hashana).
    const { month, day } = hebrewMonthDay(new Date(Date.UTC(2026, 8, 12, 12)));
    return month === 'Tishri' && day === 1;
  } catch {
    return false;
  }
})();

if (!ICU_HEBREW_OK) {
  logger.warn(
    '[shabbat.service] ICU Hebrew calendar unavailable — using the hardcoded yom-tov table ' +
      '(valid through Shavuot 2029). Shabbat itself is unaffected.',
  );
}

function toDateKey(civilNoonUtc: Date): string {
  return civilNoonUtc.toISOString().slice(0, 10);
}

/** Is the Gregorian civil date (given as noon UTC) a yom tov in Israel? */
function isYomTovCivilDate(civilNoonUtc: Date, useIcu: boolean = ICU_HEBREW_OK): boolean {
  if (!useIcu) return YOM_TOV_FALLBACK_DATES.has(toDateKey(civilNoonUtc));
  const { month, day } = hebrewMonthDay(civilNoonUtc);
  return YOM_TOV_HEBREW_DATES.some(([m, d]) => m === month && d === day);
}

/** Saturday or yom tov. */
function isRestDay(civilNoonUtc: Date, useIcu: boolean): boolean {
  return civilNoonUtc.getUTCDay() === 6 || isYomTovCivilDate(civilNoonUtc, useIcu);
}

/**
 * True when `now` falls inside the Shabbat / yom tov window in Israel (see
 * header for the exact window). Pure function of `now` — no I/O.
 *
 * `useIcu` is for tests only (to exercise the fallback table).
 */
export function isShabbatOrYomTov(now: Date = new Date(), useIcu: boolean = ICU_HEBREW_OK): boolean {
  const { year, month, day, minutes } = jerusalemParts(now);
  const today = new Date(Date.UTC(year, month - 1, day, 12));
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12));
  if (minutes < SHABBAT_END_MINUTES && isRestDay(today, useIcu)) return true;
  if (minutes >= SHABBAT_START_MINUTES && isRestDay(tomorrow, useIcu)) return true;
  return false;
}

/** Exported for tests — whether a Gregorian 'YYYY-MM-DD' is a yom tov in Israel. */
export function isYomTovDate(dateKey: string, useIcu: boolean = ICU_HEBREW_OK): boolean {
  const [y, m, d] = dateKey.split('-').map(Number);
  return isYomTovCivilDate(new Date(Date.UTC(y, m - 1, d, 12)), useIcu);
}
