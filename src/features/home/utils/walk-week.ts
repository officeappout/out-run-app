/**
 * Home's walking slice — pure (enable_home_v2). See hooks/useWalkWeek.ts.
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

export interface WalkWeekState {
  /** A planned walk in the coming 7 days → home orders for a walker. */
  isWalker: boolean;
  today: UserScheduleEntry | null;
  next: UserScheduleEntry | null;
}

export const EMPTY_WALK_WEEK: WalkWeekState = { isWalker: false, today: null, next: null };

const pad = (n: number) => String(n).padStart(2, '0');

export function nextSevenDates(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

export function walkWeekFrom(
  byDate: Readonly<Record<string, UserScheduleEntry[]>>,
  dates: readonly string[],
  isWalk: (e: UserScheduleEntry) => boolean,
): WalkWeekState {
  const walks = dates.flatMap((d) => (byDate[d] ?? []).filter(isWalk));
  if (!walks.length) return EMPTY_WALK_WEEK;
  const today = walks.find((w) => w.date === dates[0]) ?? null;
  const next = walks.find((w) => w.date > dates[0] && !w.completed) ?? null;
  return { isWalker: true, today, next };
}
