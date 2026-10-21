/**
 * Israel local clock → UTC, without relying on the host's tz database.
 *
 * Rule in force since 2013 (חוק אזור הזמן, תיקון 2013):
 * - standard time (IST) = UTC+2
 * - summer time (IDT) = UTC+3, from the Friday before the last Sunday of
 *   March at 02:00 until the last Sunday of October at 02:00.
 *
 * Pure. Month is 1-based everywhere in this module.
 */

/** Day-of-month of the last Sunday of a month (month 1-based). */
export function lastSundayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay(); // 0 = Sunday
  return lastDay - dow;
}

/** True when the local civil date (whole day, ignoring the 02:00 switch hour) is on summer time. */
export function isIsraelSummerTime(year: number, month: number, day: number): boolean {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;
  if (month === 3) return day >= lastSundayOfMonth(year, 3) - 2; // Friday before last Sunday
  return day < lastSundayOfMonth(year, 10);
}

export function israelUtcOffsetHours(year: number, month: number, day: number): 2 | 3 {
  return isIsraelSummerTime(year, month, day) ? 3 : 2;
}

/** UTC instant for an Israel local wall-clock time. */
export function israelLocalToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const off = israelUtcOffsetHours(year, month, day);
  return new Date(Date.UTC(year, month - 1, day, hour - off, minute));
}

/** Israel local {year, month (1-based), day, hour} for a UTC instant. */
export function utcToIsraelLocal(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  // Try summer offset first, confirm it lands on a summer-time date; else standard.
  for (const off of [3, 2] as const) {
    const l = new Date(d.getTime() + off * 3_600_000);
    const y = l.getUTCFullYear();
    const m = l.getUTCMonth() + 1;
    const day = l.getUTCDate();
    if (israelUtcOffsetHours(y, m, day) === off) {
      return { year: y, month: m, day, hour: l.getUTCHours(), minute: l.getUTCMinutes() };
    }
  }
  const l = new Date(d.getTime() + 2 * 3_600_000);
  return { year: l.getUTCFullYear(), month: l.getUTCMonth() + 1, day: l.getUTCDate(), hour: l.getUTCHours(), minute: l.getUTCMinutes() };
}
