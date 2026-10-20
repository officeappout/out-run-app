/**
 * Start a walk (enable_home_v2, owner 20.10.2026: the SIMPLEST player) — the existing
 * free walk on the map, its drawer pre-filled with the walk's goal (time or distance):
 * the same stash → /map?openRun=walking hand-off a scheduled run already uses
 * (lib/planned-run.ts; DiscoverLayer consumes it under the flag). Route mode stays the
 * drawer's own choice. No paced plan player.
 */
import { stashPendingPlannedRun } from '@/lib/planned-run';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { walkPlannedRun } from './walkSchedule';

export const FREE_WALK_HREF = '/map?openRun=walking';

export function startPlannedWalk(plannedRun: unknown, push: (href: string) => void): void {
  stashPendingPlannedRun('walking', plannedRun);
  push(FREE_WALK_HREF);
}

export function startWalkEntry(entry: Pick<UserScheduleEntry, 'plannedRun'>, push: (href: string) => void): void {
  startPlannedWalk(entry.plannedRun, push);
}

/** "הליכה קצרה להשלמת הצעדים" — a timed walk. */
export function startShortWalk(minutes: number, push: (href: string) => void): void {
  startPlannedWalk(walkPlannedRun({ type: 'time', minutes }), push);
}
