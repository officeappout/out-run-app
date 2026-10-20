/**
 * Availability → which days the engine may place main sessions on (H1), their windows,
 * and the long-run target day (S1 + the owner's default rule).
 */
import { SATURDAY_DEFAULT_OFF, SATURDAY_DOW } from './config';
import type { Availability, AvailabilityException, TimeWindow } from './types';

const WINDOW_ORDER: TimeWindow[] = ['morning', 'noon', 'evening'];

export function windowsOf(av: Availability, dow: number): TimeWindow[] {
  const w = av.windows?.[String(dow)] ?? av.windows?.['*'];
  if (!w) return [...WINDOW_ORDER];
  return WINDOW_ORDER.filter((x) => w.includes(x));
}

export function exceptionOn(av: Availability, dow: number): AvailabilityException | null {
  for (const ex of av.exceptions ?? []) {
    if (dow >= ex.fromDow && dow <= ex.toDow) return ex;
  }
  return null;
}

export interface DayAvailability {
  /** Main sessions may go here. */
  open: boolean[];
  /** Marked free by the user before exceptions (travel days are "free but away"). */
  marked: boolean[];
  windows: TimeWindow[][];
  exception: Array<AvailabilityException | null>;
}

/**
 * `fromDow` freezes the days before it (history: they already happened).
 */
export function resolveDays(av: Availability, fromDow = 0): DayAvailability {
  const open: boolean[] = [];
  const marked: boolean[] = [];
  const windows: TimeWindow[][] = [];
  const exception: Array<AvailabilityException | null> = [];
  for (let d = 0; d < 7; d++) {
    const w = windowsOf(av, d);
    const isMarked = av.days.includes(d) && w.length > 0;
    const ex = exceptionOn(av, d);
    marked.push(isMarked);
    windows.push(w);
    exception.push(ex);
    open.push(isMarked && !ex && d >= fromDow);
  }
  return { open, marked, windows, exception };
}

/**
 * OWNER rule (config LONG_RUN_DEFAULT_RULE): the preferred long-run day when it is open,
 * else the last open day of the week. Returns the day and whether it was the preference.
 */
export function longRunTargetDay(
  open: readonly boolean[],
  preferred: number | null | undefined,
): { day: number | null; source: 'preferred' | 'last_free' } {
  if (preferred != null && open[preferred]) return { day: preferred, source: 'preferred' };
  for (let d = 6; d >= 0; d--) if (open[d]) return { day: d, source: 'last_free' };
  return { day: null, source: 'last_free' };
}

/**
 * OWNER (20.10.2026, config SATURDAY_DEFAULT_OFF): the days a recommendation may
 * pre-mark — Sunday–Friday, plus Saturday only when the user marked it free.
 */
export function defaultTrainingDays(allowSaturday = false): number[] {
  const all = [0, 1, 2, 3, 4, 5, 6];
  return SATURDAY_DEFAULT_OFF && !allowSaturday ? all.filter((d) => d !== SATURDAY_DOW) : all;
}

/** Did the user mark Saturday as a training day (any of these day lists holds it)? */
export function saturdayMarked(...dayLists: ReadonlyArray<readonly number[] | null | undefined>): boolean {
  return dayLists.some((l) => !!l && l.includes(SATURDAY_DOW));
}
