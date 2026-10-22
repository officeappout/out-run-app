/**
 * "מתי מגיעים?" wheel (enable_map_polish_v1) — pure slot logic, unit-tested.
 *
 * The wheel picks an arrival START (today / tomorrow · hour · minute in 15-min
 * steps). The publish still writes today's planned_sessions shape: a
 * startTime + endTime window; the end is start + ARRIVAL_WINDOW_MIN (the old
 * slider's default 17:00–19:00 width), so nothing downstream changes.
 */

/** Minute step on the wheel (same as the old slider's RANGE_STEP_MIN). */
export const ARRIVAL_STEP_MIN = 15;
/** The earliest slot is at least this far in the future. */
export const ARRIVAL_LEAD_MIN = 15;
/** Window length written with the start (the old default window was 2 h). */
export const ARRIVAL_WINDOW_MIN = 120;

export type ArrivalDay = 0 | 1; // 0 = today, 1 = tomorrow

export interface ArrivalSelection {
  day: ArrivalDay;
  hour: number;
  minute: number;
}

const MINUTE_MS = 60_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Rounds minutes-of-day up to the next step (a value on a step stays). */
export function ceilToStep(minutes: number, step = ARRIVAL_STEP_MIN): number {
  return Math.ceil(minutes / step) * step;
}

/** The earliest allowed arrival: the first 15-min slot ≥ now + 15 min. */
export function earliestArrival(now: Date = new Date()): Date {
  const t = new Date(now.getTime() + ARRIVAL_LEAD_MIN * MINUTE_MS);
  t.setSeconds(0, 0);
  // Any leftover seconds push to the next minute first, so 17:00:30 + 15 → 17:30, not 17:15.
  const extra = now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0;
  const mins = t.getHours() * 60 + t.getMinutes() + extra;
  const base = startOfDay(t);
  return new Date(base.getTime() + ceilToStep(mins) * MINUTE_MS);
}

function dayIndexOf(d: Date, now: Date): ArrivalDay {
  return startOfDay(d).getTime() === startOfDay(now).getTime() ? 0 : 1;
}

/** The wheel's default — the earliest allowed slot. */
export function defaultArrival(now: Date = new Date()): ArrivalSelection {
  const e = earliestArrival(now);
  return { day: dayIndexOf(e, now), hour: e.getHours(), minute: e.getMinutes() };
}

/** Days on the wheel: today only while a slot is left today; tomorrow always. */
export function arrivalDayOptions(now: Date = new Date()): ArrivalDay[] {
  return dayIndexOf(earliestArrival(now), now) === 0 ? [0, 1] : [1];
}

/** Hours on the wheel for `day` — only future ones. */
export function arrivalHourOptions(day: ArrivalDay, now: Date = new Date()): number[] {
  const e = earliestArrival(now);
  const from = dayIndexOf(e, now) === day ? e.getHours() : 0;
  return Array.from({ length: 24 - from }, (_, i) => from + i);
}

/** Minutes on the wheel (15-min steps) for `day` + `hour` — only future ones. */
export function arrivalMinuteOptions(day: ArrivalDay, hour: number, now: Date = new Date()): number[] {
  const e = earliestArrival(now);
  const all = Array.from({ length: 60 / ARRIVAL_STEP_MIN }, (_, i) => i * ARRIVAL_STEP_MIN);
  if (dayIndexOf(e, now) === day && e.getHours() === hour) return all.filter((m) => m >= e.getMinutes());
  return all;
}

/** The selection as a Date. */
export function arrivalStart(sel: ArrivalSelection, now: Date = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + sel.day);
  d.setHours(sel.hour, sel.minute, 0, 0);
  return d;
}

/**
 * Snaps a selection onto the wheel's options: step-rounds the minute and
 * lifts anything before the earliest slot (a past time) up to it.
 */
export function normalizeArrival(sel: ArrivalSelection, now: Date = new Date()): ArrivalSelection {
  const days = arrivalDayOptions(now);
  const day = days.includes(sel.day) ? sel.day : days[0];
  const hour = Math.min(23, Math.max(0, Math.floor(sel.hour)));
  let minute = ceilToStep(Math.max(0, sel.minute));
  let h = hour;
  if (minute >= 60) { minute = 0; h += 1; }
  if (h > 23) { h = 23; minute = 60 - ARRIVAL_STEP_MIN; }
  const candidate: ArrivalSelection = { day, hour: h, minute };
  if (arrivalStart(candidate, now).getTime() < earliestArrival(now).getTime()) return defaultArrival(now);
  return candidate;
}

/** The planned_sessions window written on publish — same fields as today's slider path. */
export function arrivalWindow(sel: ArrivalSelection, now: Date = new Date()): { startTime: Date; endTime: Date } {
  const startTime = arrivalStart(sel, now);
  const endTime = new Date(startTime.getTime() + ARRIVAL_WINDOW_MIN * MINUTE_MS);
  return { startTime, endTime };
}

/** Minutes-of-day pair for the selection (the old slider's unit) — for parity with resolveArrivalWindow. */
export function arrivalRangeMinutes(sel: ArrivalSelection): [number, number] {
  const start = sel.hour * 60 + sel.minute;
  return [start, start + ARRIVAL_WINDOW_MIN];
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
