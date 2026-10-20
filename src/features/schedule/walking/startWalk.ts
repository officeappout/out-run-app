/**
 * Start a walk (enable_home_v2, owner 20.10.2026: the SIMPLEST player) — the existing
 * free walk on the map, its drawer pre-filled with the walk's goal (time or distance):
 * the same stash → /map?openRun=walking hand-off a scheduled run already uses
 * (lib/planned-run.ts; DiscoverLayer consumes it under the flag). No paced plan player.
 *
 * Follow-ups (owner 20.10.2026):
 *  - the drawer opens on the route step — a loop that fits the goal is ready
 *    (walkHandoff auto-route; "התחל חופשי" stays one tap back);
 *  - a walk started from a planned entry marks that entry completed when it is saved
 *    (walkHandoff pending entry → walkComplete.service).
 */
import { stashPendingPlannedRun } from '@/lib/planned-run';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { walkPlannedRun } from './walkSchedule';
import { markPendingWalkEntry, markWalkAutoRoute } from './walkHandoff';

export const FREE_WALK_HREF = '/map?openRun=walking';

export function startPlannedWalk(
  plannedRun: unknown,
  push: (href: string) => void,
  from?: Partial<Pick<UserScheduleEntry, 'date' | 'entryId'>>,
): void {
  stashPendingPlannedRun('walking', plannedRun);
  markWalkAutoRoute();
  markPendingWalkEntry({ date: from?.date, entryId: from?.entryId });
  push(FREE_WALK_HREF);
}

export function startWalkEntry(
  entry: Pick<UserScheduleEntry, 'plannedRun'> & Partial<Pick<UserScheduleEntry, 'date' | 'entryId'>>,
  push: (href: string) => void,
): void {
  startPlannedWalk(entry.plannedRun, push, entry);
}

/** "הליכה קצרה להשלמת הצעדים" — a timed walk. */
export function startShortWalk(minutes: number, push: (href: string) => void): void {
  startPlannedWalk(walkPlannedRun({ type: 'time', minutes }), push);
}
