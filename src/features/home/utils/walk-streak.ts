/**
 * Walking streak in WEEKS (enable_home_two_cards_v1, canvas WR-6) — pure.
 *
 * A "walk week" is a Sunday-Saturday week (Israel) that holds at least one COMPLETED planned
 * walk (the walk plan's own schedule entries, isPlannedWalkEntry). The streak counts the
 * consecutive walk weeks ending now: the current week counts when it already has a walk, but
 * a current week that has none YET does not break a run that reached last week.
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** How many consecutive weeks make the nudge. */
export const TRY_RUNNING_MIN_WEEKS = 4;
/** Weeks looked back, current one included (4 full weeks + this one). */
export const WALK_STREAK_LOOKBACK_WEEKS = TRY_RUNNING_MIN_WEEKS + 1;

/** The Sunday of the week containing `d` (local time). */
export function weekStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

/** Every date (yyyy-mm-dd) from the first lookback week's Sunday through today. */
export function walkStreakDates(now = new Date()): string[] {
  const start = weekStartOf(now);
  start.setDate(start.getDate() - 7 * (WALK_STREAK_LOOKBACK_WEEKS - 1));
  const out: string[] = [];
  for (let d = new Date(start); iso(d) <= iso(now); d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

export interface WalkStreak {
  /** Consecutive walk weeks ending now. */
  weeks: number;
  /** Completed planned walks inside that run. */
  walks: number;
}

export const EMPTY_WALK_STREAK: WalkStreak = { weeks: 0, walks: 0 };

export function walkStreakFrom(
  byDate: Readonly<Record<string, UserScheduleEntry[]>>,
  isWalk: (e: UserScheduleEntry) => boolean,
  now = new Date(),
): WalkStreak {
  const thisWeek = weekStartOf(now);
  // walks per week offset (0 = this week, 1 = last week, ...).
  const perWeek: number[] = Array.from({ length: WALK_STREAK_LOOKBACK_WEEKS }, () => 0);
  for (const [date, entries] of Object.entries(byDate)) {
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const offset = Math.round((thisWeek.getTime() - weekStartOf(new Date(y, m - 1, d)).getTime()) / (7 * 86_400_000));
    if (offset < 0 || offset >= perWeek.length) continue;
    perWeek[offset] += (entries ?? []).filter((e) => e.completed === true && isWalk(e)).length;
  }
  let weeks = 0;
  let walks = 0;
  // A current week with no walk yet is skipped, not a break.
  for (let i = perWeek[0] > 0 ? 0 : 1; i < perWeek.length && perWeek[i] > 0; i++) {
    weeks += 1;
    walks += perWeek[i];
  }
  return { weeks, walks };
}
