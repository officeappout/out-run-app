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
 * Throws if the user is not authenticated or the API returns an error.
 */
export async function createRunInvite(
  activityType: 'running' | 'walking',
  options?: { scheduledFor?: string },
): Promise<RunInviteResult> {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new Error('invite-not-authenticated');

  const session = useSharedSession.getState();
  // Re-invite only makes sense for "now" (live session). Scheduled invites always
  // create a new group so participants join at the right future time.
  const isReInvite = Boolean(!options?.scheduledFor && session.groupId && session.attendanceId);

  const body: Record<string, unknown> = { activityType };
  if (isReInvite) {
    body.existingGroupId      = session.groupId;
    body.existingAttendanceId = session.attendanceId;
  }
  if (options?.scheduledFor) {
    body.scheduledFor = options.scheduledFor;
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
