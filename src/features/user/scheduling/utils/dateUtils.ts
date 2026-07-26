/**
 * UTS Date Utilities — Sunday-start standard
 *
 * Convention: JS Date.getDay() → 0=Sun=א, 1=Mon=ב, …, 6=Sat=ש
 * This matches the Hebrew day array used across the entire codebase
 * (SmartWeeklySchedule, home/page.tsx, profile cards, onboarding-sync, etc.)
 *
 * DO NOT use (getDay() + 6) % 7 — that is a Monday-offset and is WRONG here.
 * The ISO Monday convention is kept ONLY inside useWeeklyVolumeStore (budget
 * windows) and admin analytics — do not touch those.
 */

import type { HebrewDayLetter } from '../types/schedule.types';

export const HEBREW_DAYS: HebrewDayLetter[] = [
  'א', // 0 = Sunday
  'ב', // 1 = Monday
  'ג', // 2 = Tuesday
  'ד', // 3 = Wednesday
  'ה', // 4 = Thursday
  'ו', // 5 = Friday
  'ש', // 6 = Saturday
];

// ── Basic helpers ──────────────────────────────────────────────────────────

/** Format a Date as 'YYYY-MM-DD' (local time). */
export function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Return the Hebrew day letter for a given date.
 * Sun → 'א', Mon → 'ב', …, Sat → 'ש'
 */
export function getHebrewDayLetter(d: Date): HebrewDayLetter {
  return HEBREW_DAYS[d.getDay()];
}

/**
 * Sunday-based week start (Sun=0).
 * Returns 'YYYY-MM-DD' for the Sunday of the given date's week.
 * Matches the convention in useActivityStore.getWeekStartString().
 */
export function getSundayWeekStart(d: Date): string {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay()); // subtract days since Sunday
  start.setHours(0, 0, 0, 0);
  return toISODate(start);
}

/**
 * Add `n` calendar days to a date and return 'YYYY-MM-DD'.
 * Used by getWeekEntries to build the 7-day window.
 */
export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * Step the selected day by ±1 within the CURRENT week (Sun–Sat), matching the
 * home day-swipe. `dir` = +1 (next / later day) or -1 (previous). Returns the new
 * ISO date, or `null` if the selected day is already at the week edge (Sunday for
 * -1, Saturday for +1). Clamped to the visible week — the home strip only ever
 * renders the current week; cross-week navigation stays on the month toggle.
 */
export function stepSelectedDate(iso: string, dir: 1 | -1): string | null {
  const today = new Date();
  const baseDow = new Date(`${iso}T00:00:00`).getDay();
  const nextDow = Math.min(6, Math.max(0, baseDow + dir));
  if (nextDow === baseDow) return null; // already at the week edge
  const dayDate = new Date(today);
  dayDate.setDate(today.getDate() - today.getDay() + nextDow);
  return dayDate.toISOString().split('T')[0];
}

// ── Momentum Guard ─────────────────────────────────────────────────────────

/**
 * Late-Night Pivot — PM requirement:
 *
 * Returns true ONLY when:
 *   (a) trainingTime is set, AND
 *   (b) current local hour is ≥ 20 (8 PM), AND
 *   (c) the workout has not yet been started today
 *
 * When true, the caller should pass availableTime:15 to generateHomeWorkout,
 * which routes through WorkoutGenerator's ≤15-min compound-only path.
 *
 * During the day (before 20:00) we are always flexible — no condensing.
 */
export function isLateNightPivot(_trainingTime: string | undefined): boolean {
  // DEACTIVATED: Late-Night Pivot is paused while the Bolt-specific duration
  // caps (30 / 45 / 60 min) replace the old 15-min condensed path.
  // Original logic is preserved below and can be re-enabled once the new
  // duration model is validated in production.
  //
  // if (!_trainingTime) return false;
  // const currentHour = new Date().getHours();
  // return currentHour >= 20;
  return false;
}
