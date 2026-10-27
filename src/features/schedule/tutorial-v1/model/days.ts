/**
 * ל3 "באילו ימים?" state: which days are free, the part of the day per free day, and an optional exact
 * time for that one day. Pure (__tests__/days.test.ts).
 *
 * Tap a window chip = that part of the day. Tap the selected chip again = exact time for that day only.
 */
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { RUN_TIME_PRESETS } from '@/features/schedule/utils/runWeekRecommendation';

export interface DayChoice {
  window: TimeWindow;
  /** "HH:MM" set for this day only. */
  time?: string;
}

/** Key = day of week (0 = Sunday). */
export type DaysState = Partial<Record<number, DayChoice>>;

export const SESSION_MINUTES = [20, 30, 45, 60] as const;
export type SessionMinutes = (typeof SESSION_MINUTES)[number];
export const DEFAULT_SESSION_MINUTES: SessionMinutes = 30;

export const freeDays = (s: DaysState): number[] =>
  Object.keys(s).map(Number).filter((d) => s[d] != null).sort((a, b) => a - b);

export function toggleDay(s: DaysState, dow: number, fallback: TimeWindow): DaysState {
  const next = { ...s };
  if (next[dow]) delete next[dow];
  else next[dow] = { window: fallback };
  return next;
}

/** A chip tap. `editTime` = the selected chip was tapped again: open the exact time picker for this day. */
export function tapWindow(s: DaysState, dow: number, w: TimeWindow): { state: DaysState; editTime: boolean } {
  const cur = s[dow];
  if (!cur) return { state: s, editTime: false };
  if (cur.window === w) return { state: s, editTime: true };
  return { state: { ...s, [dow]: { window: w } }, editTime: false };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The exact time for one day. An invalid / empty value clears it (the window's preset applies). */
export function setDayTime(s: DaysState, dow: number, time: string): DaysState {
  const cur = s[dow];
  if (!cur) return s;
  return { ...s, [dow]: HHMM.test(time) ? { window: cur.window, time } : { window: cur.window } };
}

/** The time a day's session shows: its exact time, else the window's preset. */
export const timeOfChoice = (c: DayChoice): string => c.time ?? RUN_TIME_PRESETS[c.window].time;

/** The last free day (default long-run day: "היום הפנוי האחרון"). */
export function lastFreeDay(s: DaysState): number | null {
  const days = freeDays(s);
  return days.length ? days[days.length - 1] : null;
}

/** Next free day after `cur` in week order (wraps). The long-run row cycles through the free days. */
export function nextFreeDay(s: DaysState, cur: number | null): number | null {
  const days = freeDays(s);
  if (!days.length) return null;
  if (cur == null) return days[0];
  return days.find((d) => d > cur) ?? days[0];
}

/** Starting days: the recommended ones, each with the user's usual part of the day. */
export function initialDays(recommended: readonly number[], window: TimeWindow): DaysState {
  const out: DaysState = {};
  for (const d of recommended) if (d >= 0 && d <= 6) out[d] = { window };
  return out;
}
