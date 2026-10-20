/**
 * The coming 7 days, today first (pure; display only). A signup week shows
 * the next occurrence of every weekday — today or later — so a preview card
 * is never a "past" (missed) day.
 */

/** Local YYYY-MM-DD (not toISOString, which is UTC and can shift the day). */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ComingWeekDay {
  dow: number;
  /** 'YYYY-MM-DD' of the next occurrence (today included). */
  iso: string;
  dayOfMonth: number;
}

/** Seven days starting today, in calendar order. */
export function comingWeek(now: Date = new Date()): ComingWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { dow: d.getDay(), iso: localIsoDate(d), dayOfMonth: d.getDate() };
  });
}

/** Day-of-month per weekday (index 0 = Sunday) for the coming week. */
export function comingDayOfMonthByDow(now: Date = new Date()): number[] {
  const out = new Array<number>(7).fill(0);
  for (const d of comingWeek(now)) out[d.dow] = d.dayOfMonth;
  return out;
}
