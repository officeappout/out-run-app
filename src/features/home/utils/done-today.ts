/**
 * Home v2 "DoneToday" card — pure numbers for it (design lab, 17.10.2026).
 * Real data only: today's saved workout docs, the user's schedule days.
 */

/** Same letters (and order, Sunday = 0) the home week strip uses. */
const WEEK_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export interface DoneTodayWorkout {
  /** seconds */
  duration: number;
  xpEarned?: number;
}

/** XP summed from the docs that recorded it; 0 when none did (the card then hides XP). */
export function totalXp(workouts: readonly DoneTodayWorkout[]): number {
  return workouts.reduce((sum, w) => sum + (Number.isFinite(w.xpEarned) && (w.xpEarned as number) > 0 ? (w.xpEarned as number) : 0), 0);
}

/** Sum of whole minutes (each card's own rounded minutes, so the total matches the rows). */
export function totalMinutes(minutesPerWorkout: readonly number[]): number {
  return minutesPerWorkout.reduce((sum, m) => sum + (Number.isFinite(m) && m > 0 ? m : 0), 0);
}

/**
 * The next training day after today in the user's weekly schedule, within the
 * coming week. null when the user has no schedule days.
 */
export function nextPlannedDay(
  scheduleDays: readonly string[],
  todayIndex: number,
): { offset: number; label: string } | null {
  if (scheduleDays.length === 0) return null;
  for (let offset = 1; offset <= 7; offset++) {
    const idx = (todayIndex + offset) % 7;
    if (scheduleDays.includes(WEEK_LETTERS[idx])) {
      return { offset, label: offset === 1 ? 'מחר' : `יום ${DAY_NAMES[idx]}` };
    }
  }
  return null;
}
