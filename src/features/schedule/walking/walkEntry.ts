/**
 * Which schedule entries are planned walks (enable_home_v2). Pure, import-light — read
 * by the agenda and the strength day resolver. See walkSchedule.ts for the entry shape.
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

export const WALK_ENTRY_PREFIX = 'walkplan_';

/** A walk entry the walking signup wrote (only these are replaced on a re-plan). */
export function isOwnWalkEntry(e: Pick<UserScheduleEntry, 'entryId'>): boolean {
  return typeof e.entryId === 'string' && e.entryId.startsWith(WALK_ENTRY_PREFIX);
}

/**
 * A personal planned walk: no strength program, walking category, a free-walk goal.
 * The strength generator must not read it as "today's program" (resolveScheduledProgram).
 */
export function isPlannedWalkEntry(
  e: Pick<UserScheduleEntry, 'type' | 'source' | 'programIds' | 'scheduledCategories' | 'plannedRun'>,
): boolean {
  return (
    e.type === 'training' &&
    e.source !== 'community' &&
    !(e.programIds?.length) &&
    !!e.plannedRun &&
    (e.scheduledCategories ?? []).includes('walking')
  );
}
