/**
 * One send path for the three group-session pushes. Copy comes from the push library
 * (push-copy.service), delivery from sendPush, so channel preferences, Shabbat, quiet hours, rate
 * caps and push policy v2 all apply there — nothing is re-implemented here.
 *
 * A marker doc (session_push_fired/{kind__group__session__uid}) is claimed with create() BEFORE the
 * send, so a retried trigger or an overlapping scheduler tick never pushes the same person twice.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { sendPush, type SendPushResult } from '../services/push.service';
import { resolvePushCopy, pushCopyData, loadPushRecipient } from '../services/push-copy.service';
import { PUSH_TYPE_IDS } from '../services/push-measure-all';
import { withoutDemoUids } from '../lib/demo';
import { isEphemeralGroup } from '../lib/group-lifecycle';
import { displayTime, sessionPushMarkerId } from './session-time';

export const SESSION_PUSH_FLAG = 'enableSessionPushes';
export const SESSION_PUSH_MARKERS = 'session_push_fired';

export type SessionPushKind = 'session_reminder' | 'session_cancelled' | 'session_waitlist_promoted';

interface KindConfig {
  channel: 'training_reminder' | 'social';
  typeId: string;
  trigger: string;
  /** Reminder = a thing the user asked for by booking (v2: exempt from proactive caps, from 06:00). */
  policyKind: 'requested' | 'proactive';
  personal: boolean;
}

const KINDS: Record<SessionPushKind, KindConfig> = {
  session_reminder: { channel: 'training_reminder', typeId: PUSH_TYPE_IDS.sessionReminder, trigger: 'SessionReminder', policyKind: 'requested', personal: false },
  session_cancelled: { channel: 'social', typeId: PUSH_TYPE_IDS.sessionCancelled, trigger: 'SessionCancelled', policyKind: 'requested', personal: true },
  session_waitlist_promoted: { channel: 'social', typeId: PUSH_TYPE_IDS.sessionWaitlistPromoted, trigger: 'SessionWaitlistPromoted', policyKind: 'requested', personal: true },
};

/** app_config/feature_flags.enableSessionPushes — fails CLOSED on a read error. */
export async function sessionPushesEnabled(db: admin.firestore.Firestore): Promise<boolean> {
  try {
    const snap = await db.doc('app_config/feature_flags').get();
    return snap.exists && (snap.data() as Record<string, unknown>)[SESSION_PUSH_FLAG] === true;
  } catch (err) {
    logger.error('[session-push] feature_flags read failed, treating as off', err);
    return false;
  }
}

export interface SessionGroupInfo {
  name: string;
}

/** The group a session belongs to, or null when pushes must not go out (missing / ephemeral run-invite group). */
export async function loadSessionGroup(
  db: admin.firestore.Firestore,
  groupId: string,
): Promise<SessionGroupInfo | null> {
  try {
    const snap = await db.doc(`community_groups/${groupId}`).get();
    if (!snap.exists) return null;
    const group = snap.data() as Record<string, unknown>;
    if (isEphemeralGroup(group) || group.moderationState === 'removed') return null;
    return { name: String(group.name ?? '') };
  } catch (err) {
    logger.warn(`[session-push] group ${groupId} read failed, skipping`, err);
    return null;
  }
}

async function claim(db: admin.firestore.Firestore, id: string): Promise<boolean> {
  try {
    await db.collection(SESSION_PUSH_MARKERS).doc(id).create({ at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code === 6 || code === 'already-exists') return false; // already sent
    logger.error(`[session-push] claim ${id} failed, skipping`, err);
    return false;
  }
}

export interface SessionPushInput {
  kind: SessionPushKind;
  groupId: string;
  sessionId: string;
  groupName: string;
  time: string;
  uids: string[];
}

/** Sends one personalised push per recipient (copy differs by name / gender). Returns how many were handed to sendPush. */
export async function sendSessionPushes(db: admin.firestore.Firestore, input: SessionPushInput): Promise<number> {
  const cfg = KINDS[input.kind];
  let sent = 0;
  for (const uid of withoutDemoUids([...new Set(input.uids)])) {
    if (!(await claim(db, sessionPushMarkerId(input.kind, input.groupId, input.sessionId, uid)))) continue;
    try {
      const recipient = await loadPushRecipient(uid);
      const copy = await resolvePushCopy(input.kind, {
        uid,
        audience: recipient.audience,
        vars: { '@שם': recipient.firstName, '@קבוצה': input.groupName, '@שעה': displayTime(input.time) },
        params: { groupId: input.groupId },
      });
      if (!copy) {
        logger.info(`[session-push] no copy fits ${input.kind} uid=${uid}`);
        continue;
      }
      const result: SendPushResult = await sendPush({
        toUids: [uid],
        channel: cfg.channel,
        measurementTypeId: cfg.typeId,
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: cfg.trigger, groupId: input.groupId, sessionId: input.sessionId, ...pushCopyData(copy) },
        // The marker above is the once-per-session guard; the channel's 24h cap would drop a second session the same day.
        rateCapHours: 0,
        policyKind: cfg.policyKind,
        isPersonalInteraction: cfg.personal,
        skipQuietHours: false, // quiet hours are respected: held, never rerouted
      });
      sent += 1;
      logger.info(`[session-push] ${input.kind} uid=${uid} group=${input.groupId} result=${JSON.stringify(result)}`);
    } catch (err) {
      logger.error(`[session-push] ${input.kind} send failed uid=${uid}`, err);
    }
  }
  return sent;
}
