/**
 * push-events.service — measurement layer for the notification engine (Wave 1).
 *
 * Storage decision: a DEDICATED `push_events` collection, not the existing
 * `analytics_events` firehose or a `users/{uid}` scalar field. Investigated
 * both first:
 *   - `users/{uid}.onboardingStatus` / `dropoffNotifiedAt` are single
 *     overwritten scalars — cannot hold 5 events × every push × lifetime.
 *   - `analytics_events` is append-only and admin-visible (closest fit), but
 *     it's a shared, unindexed, client-writable firehose (generic
 *     `isAuthenticated()` create rule) that already feeds the onboarding
 *     funnel dashboard — piling high-volume push telemetry onto it risks
 *     slowing those queries and complicates the "goal completed within Xh"
 *     time-window query, which needs its own composite indexes.
 * `push_events/{pushId}_{uid}_{eventType}` gets a deterministic ID (safe
 * re-writes, no dupes on retry) and purpose-built indexes, isolated from
 * both.
 *
 * One `pushId` correlates all 5 events for a single logical send. It is
 * ALSO stamped as `data.messageId` in the FCM payload (push.service.ts),
 * reusing the field the native tap handler already reads
 * (`src/lib/native/push.ts`) for its pre-existing `notification_clicks` CTR
 * write — no new client-side correlation field needed.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

export type PushEventType =
  | 'push_sent'
  | 'push_opened'
  | 'push_dismissed'
  | 'post_push_outcome'
  | 'landing_screen';

export interface PushEventMetadata {
  variantId: string; // = bundleId
  category: string; // = triggerType, e.g. 'Daily_Goal'
  persona: string;
  activityType?: string;
  framing?: string; // = psychologicalTrigger
  timeOfDay?: string;
  channel: string;
}

export interface WritePushSentOpts extends PushEventMetadata {
  pushId: string;
  uid: string;
  delivered: boolean;
  /** Hours after which post_push_outcome should be evaluated. Default 6. */
  outcomeWindowHours?: number;
}

const DEFAULT_OUTCOME_WINDOW_HOURS = 6;

/** Server-side write (Admin SDK — bypasses Firestore rules). Called from
 * push.service.ts's sendPush() when opts.measurement is provided. */
export async function writePushSentEvent(opts: WritePushSentOpts): Promise<void> {
  const windowHours = opts.outcomeWindowHours ?? DEFAULT_OUTCOME_WINDOW_HOURS;
  const now = admin.firestore.Timestamp.now();
  const checkAfter = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + windowHours * 3600 * 1000,
  );
  const docId = `${opts.pushId}_${opts.uid}_push_sent`;
  try {
    await getDb().collection('push_events').doc(docId).set({
      pushId: opts.pushId,
      uid: opts.uid,
      eventType: 'push_sent' as PushEventType,
      variantId: opts.variantId,
      category: opts.category,
      persona: opts.persona,
      activityType: opts.activityType ?? null,
      framing: opts.framing ?? null,
      timeOfDay: opts.timeOfDay ?? null,
      channel: opts.channel,
      delivered: opts.delivered,
      sentAt: now,
      outcomeWindowHours: windowHours,
      checkAfter,
      outcomeChecked: false,
      createdAt: now,
    });
  } catch (err: unknown) {
    // Measurement is best-effort — never let a logging failure block the
    // actual push send (already completed by the time this is called).
    logger.warn(`[push-events] push_sent write failed pushId=${opts.pushId} uid=${opts.uid}`, err);
  }
}

/** Server-side write for the outcome sweeper (pushOutcomeSweeper.ts). */
export async function writePostPushOutcomeEvent(opts: {
  pushSentDoc: FirebaseFirestore.QueryDocumentSnapshot;
  goalCompleted: boolean;
}): Promise<void> {
  const sent = opts.pushSentDoc.data() as Record<string, unknown>;
  const pushId = sent.pushId as string;
  const uid = sent.uid as string;
  const docId = `${pushId}_${uid}_post_push_outcome`;
  const db = getDb();
  const batch = db.batch();
  batch.set(db.collection('push_events').doc(docId), {
    pushId,
    uid,
    eventType: 'post_push_outcome' as PushEventType,
    variantId: sent.variantId ?? null,
    category: sent.category ?? null,
    persona: sent.persona ?? null,
    activityType: sent.activityType ?? null,
    framing: sent.framing ?? null,
    timeOfDay: sent.timeOfDay ?? null,
    channel: sent.channel ?? null,
    goalCompleted: opts.goalCompleted,
    checkedAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });
  batch.update(opts.pushSentDoc.ref, { outcomeChecked: true });
  try {
    await batch.commit();
  } catch (err: unknown) {
    logger.warn(`[push-events] post_push_outcome write failed pushId=${pushId} uid=${uid}`, err);
  }
}
