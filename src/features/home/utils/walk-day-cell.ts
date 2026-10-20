/**
 * Planned walks in the week strip (enable_home_v2, owner 20.10.2026) — pure.
 *
 * Before: a planned walk entry (scheduledCategories ['walking']) rendered with the
 * walking icon but in the generic cardio (run) lime, and its done state only followed
 * the strength/"Done" flag (dailyProgress.workoutCompleted) — a finished walk never
 * showed its flame. Now a walk is its own activity: the walk/steps colour, and the
 * entry's own `completed` (written when the walk is saved, walkComplete.service)
 * counts as done. Reuses the strip's resolver inputs (runningColor = colour override).
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';

export const WALK_DAY_COLOR = '#f59e0b';

export interface WalkDayCell {
  /** The day's primary training is a planned walk (no strength / community training). */
  walkPrimary: boolean;
  /** A planned walk of this day is completed. */
  walkDone: boolean;
}

export function walkDayCell(entries: readonly UserScheduleEntry[]): WalkDayCell {
  const training = entries.filter((e) => e.type === 'training');
  const walks = training.filter((e) => isPlannedWalkEntry(e));
  return {
    walkPrimary: walks.length > 0 && walks.length === training.length,
    walkDone: walks.some((w) => w.completed === true),
  };
}

/** A planned-axis session: a walk gets its own colour + icon; others unchanged. */
export function walkSessionOverride(
  entry: UserScheduleEntry,
): { programIconKey: string; runningColor: string } | null {
  return isPlannedWalkEntry(entry) ? { programIconKey: 'walking', runningColor: WALK_DAY_COLOR } : null;
}
