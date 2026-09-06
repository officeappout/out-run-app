/**
 * Israel-local time bucketing — pure, zero dependencies (just `Intl`,
 * DST-aware automatically). Shared by the write side
 * (`link-stats-write.ts`, building the daily-rollup doc id) and the read
 * side (`link-stats.ts`'s admin UI, converting a date-range picker's
 * `Date` objects into the same 'YYYY-MM-DD' keys to query by).
 *
 * "Most scans are in the evening" is a claim about local time at the
 * park, not server/UTC time — getting this wrong silently shifts every
 * hour-of-day business conclusion by 2-3 hours.
 */

const ISRAEL_TZ = 'Asia/Jerusalem';

export function getIsraelDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function getIsraelHour(date: Date): number {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ, hour: 'numeric', hour12: false,
  }).format(date);
  const hour = parseInt(raw, 10);
  return hour === 24 ? 0 : hour; // ICU has historically emitted '24' for midnight on some engines.
}

const EN_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 0 = Sunday .. 6 = Saturday (Israeli week convention, not ISO Monday-start). */
export function getIsraelDayOfWeek(date: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, weekday: 'short' }).format(date);
  const idx = EN_DAY_NAMES.indexOf(name);
  return idx === -1 ? 0 : idx;
}
