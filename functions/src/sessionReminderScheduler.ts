/**
 * sessionReminderScheduler — a friendly nudge 15 minutes before a group session starts.
 *
 * Every 5 minutes: read the attendance docs of today (and tomorrow, across midnight), pick the
 * sessions starting in the next 5-15 minutes, and remind each booked attendee once (marker doc).
 * Copy: push library 'session_reminder'. Delivery, quiet hours, caps: sendPush + push policy v2
 * (policyKind 'requested': the user booked the session).
 *
 * Gate: app_config/feature_flags.enableSessionPushes (default off, fails closed).
 * Needs the collection-group index community attendance.date (firestore.indexes.json).
 *
 * Second pass on the same tick (26.10.2026): the "I'm training here later" owner reminder
 * (trainingHere/send-training-here-push.ts), gated separately by enableTrainingHereReminders.
 * Third pass: training-here pushes held back by quiet hours / Shabbat, re-tried once the window ends
 * if still relevant (trainingHere/training-here-deferred.ts), same flag.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { loadSessionGroup, sendSessionPushes, sessionPushesEnabled } from './sessionPushes/send-session-push';
import { reminderRecipients, reminderScanDates } from './sessionPushes/session-time';
import { runTrainingHereReminderPass } from './trainingHere/send-training-here-push';
import { runTrainingHereDeferredPass } from './trainingHere/training-here-deferred';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** One tick. Exported for tests (nowMs injected). */
export async function runSessionReminderPass(db: admin.firestore.Firestore, nowMs: number): Promise<number> {
  if (!(await sessionPushesEnabled(db))) {
    logger.info('[session-reminder] enableSessionPushes !== true, skipping');
    return 0;
  }
  const snap = await db.collectionGroup('attendance').where('date', 'in', reminderScanDates(nowMs)).get();
  const groupCache = new Map<string, Awaited<ReturnType<typeof loadSessionGroup>>>();
  let sent = 0;
  for (const doc of snap.docs) {
    const groupId = doc.ref.parent.parent?.id;
    if (!groupId) continue;
    const att = doc.data() as Record<string, unknown>;
    const uids = reminderRecipients(att, nowMs);
    if (uids.length === 0) continue;
    if (!groupCache.has(groupId)) groupCache.set(groupId, await loadSessionGroup(db, groupId));
    const group = groupCache.get(groupId);
    if (!group) continue;
    sent += await sendSessionPushes(db, {
      kind: 'session_reminder', groupId, sessionId: doc.id, groupName: group.name, time: String(att.time ?? ''), uids,
    });
  }
  logger.info(`[session-reminder] scanned=${snap.size} sent=${sent}`);
  return sent;
}

export const sessionReminderScheduler = onSchedule(
  { schedule: '*/5 * * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', timeoutSeconds: 240, memory: '512MiB' },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    // Independent passes: one failing must not starve the other.
    try {
      await runSessionReminderPass(db, now);
    } catch (err) {
      logger.error('[session-reminder] group-session pass failed', err);
    }
    try {
      await runTrainingHereReminderPass(db, now);
    } catch (err) {
      logger.error('[session-reminder] training-here pass failed', err);
    }
    try {
      await runTrainingHereDeferredPass(db, now);
    } catch (err) {
      logger.error('[session-reminder] training-here deferred pass failed', err);
    }
  },
);
