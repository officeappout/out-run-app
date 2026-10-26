/**
 * onTrainingHereShared — "<name> מגיע ב-18:00 לגינה · מצטרף?" to MUTUAL partners when a planned_sessions
 * share is created FOR LATER (start at least 20 minutes after creation, within 24 hours) with the
 * audience partners ('squad') or public ('verified_global'). At most one notice per partner per session
 * (marker doc). Push prefs (notificationPrefs.community), quiet hours and the daily cap apply in sendPush.
 *
 * The owner's own 15-minute reminder is not here: it rides the sessionReminderScheduler tick.
 *
 * Gate: app_config/feature_flags.enableTrainingHereReminders (default off, fails closed).
 * With socialActivityNearbyPushEnabled also on, onPlannedActivityCreated leaves these partners out of
 * its generic partner_plan push, so nobody gets two pushes for one share.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPartnerNotices, trainingHereEnabled } from './trainingHere/send-training-here-push';
import type { PlannedSessionLike } from './trainingHere/training-here-time';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** The handler body, exported for tests. */
export async function handleTrainingHereShared(
  db: admin.firestore.Firestore,
  sessionId: string,
  session: PlannedSessionLike | undefined,
  nowMs: number,
): Promise<number> {
  if (!session) return 0;
  if (!(await trainingHereEnabled(db))) return 0;
  return sendPartnerNotices(db, sessionId, session, nowMs);
}

export const onTrainingHereShared = onDocumentCreated(
  { document: 'planned_sessions/{sessionId}', region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const { sessionId } = event.params;
    try {
      const sent = await handleTrainingHereShared(
        admin.firestore(),
        sessionId,
        event.data?.data() as PlannedSessionLike | undefined,
        Date.now(),
      );
      if (sent > 0) logger.info(`[onTrainingHereShared] session=${sessionId} partners notified=${sent}`);
    } catch (err) {
      logger.error(`[onTrainingHereShared] ${sessionId} failed`, err);
    }
  },
);
