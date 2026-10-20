/**
 * A planned walk is done (enable_home_v2, owner 20.10.2026) — pure.
 *
 * Uses the entry's EXISTING completion fields only (UserScheduleEntry.completed +
 * completedWorkoutId, schedule.types.ts) — no new field. Returns the updated entry,
 * or null when there is nothing to do (entry gone, not a planned walk, already done).
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { isPlannedWalkEntry } from './walkEntry';

export function completedWalkEntry(
  entries: readonly UserScheduleEntry[],
  entryId: string,
  workoutId: string | null | undefined,
): UserScheduleEntry | null {
  const entry = entries.find((e) => e.entryId === entryId);
  if (!entry || !isPlannedWalkEntry(entry) || entry.completed) return null;
  return { ...entry, completed: true, ...(workoutId ? { completedWorkoutId: workoutId } : {}) };
}
