/**
 * Top-up plan (board HomeAfterRules, owner 31.10.2026). Pure.
 *   length → by the sets still missing (about 2 minutes a set with rest, plus a short warm-up)
 *   place  → after 18:00, or when the user prefers evening workouts: at home, no gear, with
 *            "schedule for 20:00"; otherwise the usual place resolution.
 */
export const TOP_UP_EVENING_HOUR = 18;
export const TOP_UP_SCHEDULE_TIME = '20:00';
const MINUTES_PER_SET = 2;
const WARMUP_MINUTES = 4;
const TOP_UP_MINUTES_MIN = 10;
const TOP_UP_MINUTES_MAX = 30;

/** Session length for the missing sets, rounded to 5 minutes, 10..30. */
export function topUpMinutes(missingSets: number): number {
  const sets = Math.max(0, Math.round(Number(missingSets) || 0));
  const raw = sets * MINUTES_PER_SET + WARMUP_MINUTES;
  const rounded = Math.round(raw / 5) * 5;
  return Math.min(TOP_UP_MINUTES_MAX, Math.max(TOP_UP_MINUTES_MIN, rounded));
}

/** The top-up is an evening one: at home, no gear, offered for later. */
export function isTopUpEvening(i: { hour: number; preferEvening?: boolean }): boolean {
  return i.hour >= TOP_UP_EVENING_HOUR || i.preferEvening === true;
}
