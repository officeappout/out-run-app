/**
 * Planner v2 (enable_week_builder_v1) — writes a session's planned time to the EXISTING
 * userSchedule `startTime` field (no new field). A template day without a doc yet is hydrated
 * first (hydrateFromTemplate — the same step a move takes), then the session's own entries get
 * the time in one day-doc write (setScheduleEntriesStartTime).
 */
import {
  getScheduleEntries,
  hydrateFromTemplate,
  setScheduleEntriesStartTime,
} from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { entriesToTime, formatPlannedTime, type PlannedTime } from './plannedTime';

export interface PlannedTimeTarget {
  date: string;
  entryIds: readonly string[];
  programIds: readonly string[];
}

export async function savePlannedTime(userId: string, target: PlannedTimeTarget, time: PlannedTime, template: RecurringTemplate): Promise<boolean> {
  try {
    let entries = await getScheduleEntries(userId, target.date);
    if (target.entryIds.length === 0 && entries.length === 0) entries = await hydrateFromTemplate(userId, target.date, template);
    const ids = entriesToTime(entries, target.entryIds, target.programIds)
      .map((e) => e.entryId)
      .filter((x): x is string => !!x);
    if (ids.length === 0) return false;
    return await setScheduleEntriesStartTime(userId, target.date, ids, formatPlannedTime(time));
  } catch {
    return false;
  }
}
