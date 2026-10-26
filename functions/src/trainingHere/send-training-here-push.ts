/**
 * Send paths for the "I'm training here later" pushes (owner, 26.10.2026):
 *
 *   - owner reminder ('training_here_reminder'): 15 minutes before startTime, from the existing
 *     sessionReminderScheduler tick (runTrainingHereReminderPass).
 *   - partner notice ('training_here_partner'): when a later share for partners / public is created
 *     (onTrainingHereShared), to MUTUAL partners only.
 *
 * Copy: push library (push-copy.service). Delivery: sendPush, so push prefs (settings.pushEnabled,
 * notificationPrefs.{channel}), Shabbat, quiet hours, the daily cap and push policy v2 all apply there.
 * Idempotency: a marker doc in training_here_push_fired is create()d BEFORE each send. When sendPush
 * drops the push for quiet hours / Shabbat, the marker is marked deferred and the scheduler tick
 * re-tries it once the window ends, if still relevant (training-here-deferred.ts).
 * Cancel / edit safety: the reminder re-reads the session right before sending and checks its status
 * and start time; the marker id carries the start time, so an edited time gets its own reminder and
 * the old one can never fire (the doc no longer has that time).
 *
 * Gate: app_config/feature_flags.enableTrainingHereReminders (default off, fails closed).
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { sendPush, type SendPushResult } from '../services/push.service';
import { resolvePushCopy, pushCopyData, loadPushRecipient, loadPushSubjectGender } from '../services/push-copy.service';
import { PUSH_TYPE_IDS } from '../services/push-measure-all';
import { isDemoUid } from '../lib/demo';
import { israelHHMM } from '../shared/push-library.core';
import {
  TRAINING_HERE_FLAG,
  mutualPartners,
  ownerReminderDue,
  ownerReminderMarkerId,
  partnerNoticeEligible,
  partnerNoticeMarkerId,
  placeKind,
  placeName,
  reminderScanRange,
  toMs,
  workoutTitle,
  type PlannedSessionLike,
} from './training-here-time';
import { suppressedByWindow } from './training-here-defer';
import { claimMarker, deferMarker, markerExists } from './training-here-markers';

const COLLECTION = 'planned_sessions';

/** app_config/feature_flags.enableTrainingHereReminders — fails CLOSED on a read error. */
export async function trainingHereEnabled(db: admin.firestore.Firestore): Promise<boolean> {
  try {
    const snap = await db.doc('app_config/feature_flags').get();
    return snap.exists && (snap.data() as Record<string, unknown>)[TRAINING_HERE_FLAG] === true;
  } catch (err) {
    logger.error('[training-here] feature_flags read failed, treating as off', err);
    return false;
  }
}

function hhmm(s: PlannedSessionLike): string | undefined {
  const ms = toMs(s.startTime);
  return ms == null ? undefined : israelHHMM(new Date(ms));
}

function linkParams(s: PlannedSessionLike): Record<string, string | undefined> {
  return {
    parkId: typeof s.parkId === 'string' ? s.parkId : undefined,
    routeId: typeof s.routeId === 'string' ? s.routeId : undefined,
  };
}

/** Copy + sendPush for the owner reminder. null = no copy fits. Shared with the deferred retry. */
export async function deliverOwnerReminder(sessionId: string, s: PlannedSessionLike): Promise<SendPushResult | null> {
  const uid = String(s.userId);
  const recipient = await loadPushRecipient(uid);
  const kind = placeKind(s);
  const copy = await resolvePushCopy('training_here_reminder', {
    uid,
    audience: recipient.audience,
    vars: { '@שם': recipient.firstName, '@אימון': workoutTitle(s), '@שעה': hhmm(s), '@מקום': placeName(s) || undefined },
    conditions: kind ? { place: kind } : undefined,
    params: linkParams(s),
  });
  if (!copy) {
    logger.info(`[training-here] no reminder copy fits uid=${uid} session=${sessionId}`);
    return null;
  }
  const result = await sendPush({
    toUids: [uid],
    channel: 'training_reminder',
    measurementTypeId: PUSH_TYPE_IDS.trainingHereReminder,
    title: copy.title,
    body: copy.body,
    deepLink: copy.deepLink,
    data: { triggerType: 'TrainingHereReminder', sessionId, ...pushCopyData(copy) },
    // The marker is the once-per-session guard; the channel's 24h cap would drop a second plan the same day.
    rateCapHours: 0,
    policyKind: 'requested', // the user asked for it by planning
    skipQuietHours: false,
  });
  logger.info(`[training-here] reminder uid=${uid} session=${sessionId} result=${JSON.stringify(result)}`);
  return result;
}

/** Sends the owner reminder for one session if it is (still) due. Returns true when handed to sendPush. */
export async function sendOwnerReminder(
  db: admin.firestore.Firestore,
  sessionId: string,
  nowMs: number,
): Promise<boolean> {
  // Re-read at send time: a cancel or an edit since the scan must win.
  const snap = await db.collection(COLLECTION).doc(sessionId).get();
  if (!snap.exists) return false;
  const s = snap.data() as PlannedSessionLike;
  if (!ownerReminderDue(s, nowMs)) return false;
  const uid = String(s.userId);
  if (isDemoUid(uid)) return false;
  const startMs = toMs(s.startTime) as number;
  const markerId = ownerReminderMarkerId(sessionId, startMs);
  if (!(await claimMarker(db, markerId, { kind: 'reminder', sessionId, uid, startMs }))) return false;

  try {
    const result = await deliverOwnerReminder(sessionId, s);
    if (!result) return false;
    const held = suppressedByWindow(result);
    if (held) await deferMarker(db, markerId, 'reminder', held, nowMs);
    return true;
  } catch (err) {
    logger.error(`[training-here] reminder send failed uid=${uid} session=${sessionId}`, err);
    return false;
  }
}

/** One scheduler tick for the owner reminders. Exported for tests (nowMs injected). */
export async function runTrainingHereReminderPass(db: admin.firestore.Firestore, nowMs: number): Promise<number> {
  if (!(await trainingHereEnabled(db))) return 0;
  const { fromMs, toMs: untilMs } = reminderScanRange(nowMs);
  // Single-field range on startTime (automatic index); status / window / "later" are checked per doc.
  const snap = await db
    .collection(COLLECTION)
    .where('startTime', '>', admin.firestore.Timestamp.fromMillis(fromMs))
    .where('startTime', '<=', admin.firestore.Timestamp.fromMillis(untilMs))
    .get();
  let sent = 0;
  for (const doc of snap.docs) {
    const s = doc.data() as PlannedSessionLike;
    if (!ownerReminderDue(s, nowMs)) continue;
    // A doc stays in the window for two ticks: skip the session re-read when the marker is already there.
    if (await markerExists(db, ownerReminderMarkerId(doc.id, toMs(s.startTime) as number))) continue;
    if (await sendOwnerReminder(db, doc.id, nowMs)) sent += 1;
  }
  logger.info(`[training-here] reminder scanned=${snap.size} sent=${sent}`);
  return sent;
}

/**
 * Mutual partners a new session will notify (empty when it is not a later share for partners / public).
 * Also used by onPlannedActivityCreated to keep its generic partner_plan push off these people.
 */
export async function partnerNoticeRecipients(
  db: admin.firestore.Firestore,
  s: PlannedSessionLike,
  nowMs: number,
): Promise<string[]> {
  if (!partnerNoticeEligible(s, nowMs)) return [];
  const owner = String(s.userId);
  if (isDemoUid(owner)) return [];
  try {
    const conn = await db.doc(`connections/${owner}`).get();
    const partners = mutualPartners(conn.exists ? (conn.data() as Record<string, unknown>) : undefined, owner);
    return partners.filter((u) => !isDemoUid(u));
  } catch (err) {
    logger.warn(`[training-here] connections read failed owner=${owner}, no partner notice`, err);
    return [];
  }
}

/** Copy + sendPush for one partner notice. null = no copy fits. Shared with the deferred retry. */
export async function deliverPartnerNotice(
  sessionId: string,
  s: PlannedSessionLike,
  uid: string,
  ownerGender: Awaited<ReturnType<typeof loadPushSubjectGender>>,
): Promise<SendPushResult | null> {
  const ownerFirst = (typeof s.displayName === 'string' ? s.displayName : '').trim().split(/\s+/)[0] ?? '';
  const recipient = await loadPushRecipient(uid);
  const copy = await resolvePushCopy('training_here_partner', {
    uid,
    audience: recipient.audience,
    vars: { '@שם': recipient.firstName, '@שולח': ownerFirst, '@מקום': placeName(s) || undefined, '@שעה': hhmm(s) },
    params: linkParams(s),
    subjectGender: ownerGender,
  });
  if (!copy) {
    logger.info(`[training-here] no partner copy fits uid=${uid} session=${sessionId}`);
    return null;
  }
  const result = await sendPush({
    toUids: [uid],
    channel: 'community', // notificationPrefs.community is the opt-in
    measurementTypeId: PUSH_TYPE_IDS.trainingHerePartner,
    title: copy.title,
    body: copy.body,
    deepLink: copy.deepLink,
    data: { triggerType: 'TrainingHerePartner', sessionId, ...pushCopyData(copy) },
    rateCapHours: 0, // the marker already limits it to one per partner per session
    policyKind: 'proactive', // the partner did not ask: daily cap + quiet hours apply
    skipQuietHours: false,
  });
  logger.info(`[training-here] partner uid=${uid} session=${sessionId} result=${JSON.stringify(result)}`);
  return result;
}

/** Partner notices for a freshly created session. Returns how many were handed to sendPush. */
export async function sendPartnerNotices(
  db: admin.firestore.Firestore,
  sessionId: string,
  s: PlannedSessionLike,
  nowMs: number,
): Promise<number> {
  const partners = await partnerNoticeRecipients(db, s, nowMs);
  if (partners.length === 0) return 0;
  const owner = String(s.userId);
  const ownerGender = await loadPushSubjectGender(owner);
  const startMs = toMs(s.startTime) as number; // partnerNoticeRecipients checked it
  let sent = 0;
  for (const uid of partners) {
    const markerId = partnerNoticeMarkerId(sessionId, uid);
    if (!(await claimMarker(db, markerId, { kind: 'partner', sessionId, uid, startMs }))) continue;
    try {
      const result = await deliverPartnerNotice(sessionId, s, uid, ownerGender);
      if (!result) continue;
      sent += 1;
      const held = suppressedByWindow(result);
      if (held) await deferMarker(db, markerId, 'partner', held, nowMs);
    } catch (err) {
      logger.error(`[training-here] partner send failed uid=${uid} session=${sessionId}`, err);
    }
  }
  return sent;
}
