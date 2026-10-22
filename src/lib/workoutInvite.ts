/**
 * workoutInvite.ts — client-side helper for the "הזמן חבר לריצה" feature.
 *
 * Calls POST /api/invite/run-session which:
 *   - Creates an ephemeral community_groups doc + attendance + axiom-§17 triple-write (fresh invite)
 *   - OR reuses the caller's existing live session (re-invite)
 *   - Returns a time-limited si_ token and shareUrl
 *
 * The caller is responsible for calling startGroupSession() after a fresh invite
 * so the host enters mode:'group' presence immediately.
 */

import { auth } from '@/lib/firebase';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import type { PlannedRunSettings } from '@/lib/planned-run';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { groupFixesNow } from '@/lib/group-fixes/group-fixes-now';
import { localNowStamp, shouldReInvite } from '@/lib/group-fixes/run-invite';

export interface RunInviteResult {
  token:        string;
  shareUrl:     string;
  groupId:      string;
  attendanceId: string;
  isNewGroup:   boolean;
}

/**
 * Creates (or re-uses) a live run session and returns an invitation token.
 *
 * - If the caller is already in an active group session, issues a new token
 *   for the same session (re-invite) — no new group is created.
 * - Otherwise, creates an ephemeral group and writes the host's membership
 *   atomically (axiom §17) before returning.
 * - Pass `scheduledFor` (format: 'YYYY-MM-DDTHH:mm', local time) for a future
 *   scheduled run. The API will set expiresAt = scheduledFor + 2h and write a
 *   community schedule entry for the host automatically.
 *
 * - `plannedRun` (scheduled only): the drawer's goal + settings, stored with the
 *   scheduled run (schedule entry + group doc) so "later" keeps what was chosen.
 *
 * Throws if the user is not authenticated or the API returns an error.
 */
export async function createRunInvite(
  activityType: 'running' | 'walking',
  options?: {
    scheduledFor?: string;
    plannedRun?: PlannedRunSettings;
    /** The session lobby's own re-invite (the host's live group session). */
    fromLobby?: boolean;
  },
): Promise<RunInviteResult> {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new Error('invite-not-authenticated');

  const session = useSharedSession.getState();
  // Re-invite only makes sense for "now" (live session). Scheduled invites always
  // create a new group so participants join at the right future time.
  // enable_group_fixes_v1: re-invite only while the run IS a group run (or
  // from the lobby) — see shouldReInvite; "now" invites carry local time.
  const groupFixes = await groupFixesNow();
  const isReInvite = shouldReInvite({
    scheduled: !!options?.scheduledFor,
    groupId: session.groupId,
    attendanceId: session.attendanceId,
    groupFixes,
    isGroupRun: useRunningPlayer.getState().isGroupRun,
    fromLobby: options?.fromLobby,
  });

  const body: Record<string, unknown> = { activityType };
  if (isReInvite) {
    body.existingGroupId      = session.groupId;
    body.existingAttendanceId = session.attendanceId;
  }
  if (groupFixes && !options?.scheduledFor && !isReInvite) body.clientNow = localNowStamp();
  if (options?.scheduledFor) {
    body.scheduledFor = options.scheduledFor;
    if (options.plannedRun) body.plannedRun = options.plannedRun;
  }

  const res = await fetch('/api/invite/run-session', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`invite-api-${res.status}: ${text}`);
  }

  const data = await res.json() as { token: string; shareUrl: string; groupId: string; attendanceId: string };
  return { ...data, isNewGroup: !isReInvite };
}
