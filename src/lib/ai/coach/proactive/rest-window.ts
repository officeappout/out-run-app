/**
 * Shabbat / yom tov window for the proactive engine (Next.js side). Pure.
 *
 * The SAME window as functions/src/services/shabbat.service.ts isShabbatOrYomTov (owner
 * decision 17.10.2026): blocked from 14:00 on the day before a rest day until 20:30 on the
 * rest day, Israel time; rest day = Saturday or a yom tov (Rosh Hashana 1-2, Yom Kippur,
 * Sukkot 1, Shemini Atzeret, Pesach 1 and 7, Shavuot). Computed with the runtime's ICU
 * Hebrew calendar, with the same fallback table when ICU has no Hebrew calendar. A parity
 * test (rest-window.test.ts) checks this against the functions module, so the engine never
 * writes a message that push.service would then drop for an observer.
 */

const TZ = 'Asia/Jerusalem';
export const REST_START_MINUTES = 14 * 60;
export const REST_END_MINUTES = 20 * 60 + 30;

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

const YOM_TOV_FALLBACK_DATES: ReadonlySet<string> = new Set([
  '2026-09-12', '2026-09-13', '2026-09-21', '2026-09-26', '2026-10-03',
  '2027-04-22', '2027-04-28', '2027-06-11',
  '2027-10-02', '2027-10-03', '2027-10-11', '2027-10-16', '2027-10-23',
  '2028-04-11', '2028-04-17', '2028-05-31',
  '2028-09-21', '2028-09-22', '2028-09-30', '2028-10-05', '2028-10-12',
  '2029-03-31', '2029-04-06', '2029-05-20',
]);

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function hebrewMonthDay(civilNoonUtc: Date): { month: string; day: number } {
  const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' }).formatToParts(civilNoonUtc);
  return { month: parts.find((p) => p.type === 'month')?.value ?? '', day: Number(parts.find((p) => p.type === 'day')?.value ?? '0') };
}

const ICU_HEBREW_OK: boolean = (() => {
  try {
    const { month, day } = hebrewMonthDay(new Date(Date.UTC(2026, 8, 12, 12)));
    return month === 'Tishri' && day === 1;
  } catch {
    return false;
  }
})();

function isRestDay(civilNoonUtc: Date, useIcu: boolean): boolean {
  if (civilNoonUtc.getUTCDay() === 6) return true;
  if (!useIcu) return YOM_TOV_FALLBACK_DATES.has(civilNoonUtc.toISOString().slice(0, 10));
  const { month, day } = hebrewMonthDay(civilNoonUtc);
  return YOM_TOV_HEBREW_DATES.some(([m, d]) => m === month && d === day);
}

/** True inside the Shabbat / yom tov window in Israel. `useIcu` is for tests only. */
export function isRestWindow(now: Date, useIcu: boolean = ICU_HEBREW_OK): boolean {
  const parts = partsFmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const [y, m, d] = [get('year'), get('month'), get('day')];
  const minutes = get('hour') * 60 + get('minute');
  if (minutes < REST_END_MINUTES && isRestDay(new Date(Date.UTC(y, m - 1, d, 12)), useIcu)) return true;
  if (minutes >= REST_START_MINUTES && isRestDay(new Date(Date.UTC(y, m - 1, d + 1, 12)), useIcu)) return true;
  return false;
}
