/** Month keys ('YYYY-MM', Israel time) — pure. */
import { getIsraelDateKey } from '@/lib/israelTime';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && DAY_RE.test(v);
}

export function israelMonthKey(now: Date = new Date()): string {
  return getIsraelDateKey(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** [month-(n-1), …, month] oldest first. */
export function lastMonths(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, i - (n - 1)));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Every 'YYYY-MM-DD' in the month, up to and including `untilDay` when given. */
export function dayKeysOfMonth(month: string, untilDay?: string): string[] {
  const n = daysInMonth(month);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    if (untilDay && key > untilDay) break;
    out.push(key);
  }
  return out;
}

/** UTC range [from, to) covering the calendar month — what billing APIs take. */
export function monthUtcRange(month: string): { from: string; to: string } {
  return { from: `${month}-01T00:00:00Z`, to: `${shiftMonth(month, 1)}-01T00:00:00Z` };
}

/** Elapsed share of `month` on `today` ('YYYY-MM-DD'): 1 for past months, 0 for future ones. */
export function monthProgress(month: string, today: string): { elapsedDays: number; totalDays: number; isCurrent: boolean } {
  const totalDays = daysInMonth(month);
  const todayMonth = today.slice(0, 7);
  if (todayMonth > month) return { elapsedDays: totalDays, totalDays, isCurrent: false };
  if (todayMonth < month) return { elapsedDays: 0, totalDays, isCurrent: false };
  return { elapsedDays: Number(today.slice(8, 10)), totalDays, isCurrent: true };
}
