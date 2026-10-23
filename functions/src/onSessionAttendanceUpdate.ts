/**
 * onSessionAttendanceUpdate — two pushes off one trigger on
 * community_groups/{groupId}/attendance/{sessionId}:
 *
 *   1. WAITLIST PROMOTED: a uid moved from waitlist to attendees (the promote-waitlist route or an
 *      admin edit) -> 'session_waitlist_promoted' to that person.
 *   2. CANCELLED: `cancelled` flipped to true (written by the organizer's cancel flow; group admins
 *      may already write this doc) -> 'session_cancelled' to every attendee and waiting person.
 *
 * Gate: app_config/feature_flags.enableSessionPushes (default off, fails closed). Idempotent via the
 * marker docs in send-session-push.ts, so retries never double-send.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { loadSessionGroup, sendSessionPushes, sessionPushesEnabled } from './sessionPushes/send-session-push';
import { cancellationRecipients, newlyPromoted, type AttendanceLike } from './sessionPushes/session-time';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** The handler body, exported for tests. */
export async function handleSessionAttendanceUpdate(
  db: admin.firestore.Firestore,
  groupId: string,
  sessionId: string,
  before: AttendanceLike | undefined,
  after: AttendanceLike | undefined,
): Promise<void> {
  const promoted = newlyPromoted(before, after);
  const cancelled = cancellationRecipients(before, after);
  if (promoted.length === 0 && cancelled.length === 0) return;
  if (!(await sessionPushesEnabled(db))) return;
  const group = await loadSessionGroup(db, groupId);
  if (!group) return;
  const time = String(after?.time ?? '');
  if (promoted.length > 0) {
    await sendSessionPushes(db, { kind: 'session_waitlist_promoted', groupId, sessionId, groupName: group.name, time, uids: promoted });
  }
  if (cancelled.length > 0) {
    await sendSessionPushes(db, { kind: 'session_cancelled', groupId, sessionId, groupName: group.name, time, uids: cancelled });
  }
}

export const onSessionAttendanceUpdate = onDocumentUpdated(
  { document: 'community_groups/{groupId}/attendance/{sessionId}', region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const { groupId, sessionId } = event.params;
    try {
      await handleSessionAttendanceUpdate(
        admin.firestore(), groupId, sessionId,
        event.data?.before.data() as AttendanceLike | undefined,
        event.data?.after.data() as AttendanceLike | undefined,
      );
    } catch (err) {
      logger.error(`[onSessionAttendanceUpdate] ${groupId}/${sessionId} failed`, err);
    }
  },
);
