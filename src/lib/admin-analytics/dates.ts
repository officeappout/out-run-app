import { getIsraelDateKey } from '@/lib/israelTime';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Israel day key of `now` minus `days` days. */
export function dayKeyDaysAgo(now: Date, days: number): string {
  return getIsraelDateKey(new Date(now.getTime() - days * DAY_MS));
}

/** The last `n` Israel day keys, oldest first, ending today. */
export function lastDayKeys(now: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(dayKeyDaysAgo(now, i));
  return Array.from(new Set(keys));
}

export function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export { DAY_MS };
