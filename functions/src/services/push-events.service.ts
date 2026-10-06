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
 * One `pushId` correlates all events for a single logical send. It is
 * ALSO stamped as `data.messageId` in the FCM payload (push.service.ts),
 * reusing the field the native tap handler already reads
 * (`src/lib/native/push.ts`) for its `push_opened` CTR write — no new
 * client-side correlation field needed. (A second, separate
 * `notification_clicks` write used to read this same field; removed
 * 06.10.2026, see the push tidy-up PR — `push_events` was always the
 * richer, non-duplicated source.)
 *
 * ── Attribution window anchor: OPEN, not SEND (fixed 04.10.2026) ──────────
 * `push_sent` no longer carries a ready-to-fire `checkAfter` — a push that
 * is never opened must never produce an outcome check at all (there is
 * nothing to attribute). `checkAfter` starts `null` at send time and is
 * only populated by `activateOutcomeWindow()` below, called from
 * `onPushOpened.ts`'s Firestore trigger the moment the matching
 * `push_opened` event is written. `pushOutcomeSweeper.ts`'s query
 * (`outcomeChecked == false && checkAfter <= now`) naturally never matches
 * a `null` checkAfter — Firestore inequality filters don't match null —
 * so an un-opened push is correctly never swept, forever, with no extra
 * guard needed.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

export type PushEventType =
  | 'push_sent'
  | 'push_opened'
  | 'post_push_outcome'
  | 'landing_screen';
// push_dismissed removed 04.10.2026 — declared, zero writers, ever (no OS-level
// dismiss listener exists in this codebase; Capacitor's FirebaseMessaging plugin
// doesn't expose one). Wiring a real one is a separate future capability, not a
// "fix" of this type — see the audit doc's follow-ups.

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
  /** Hours, from OPEN (not send), within which post_push_outcome should be
   * evaluated. Default 6. Stored on the push_sent doc so activation (on open)
   * and the sweeper both read the same configured value. */
  outcomeWindowHours?: number;
}

export const DEFAULT_OUTCOME_WINDOW_HOURS = 6;

/** Pure — no I/O. The anchor is whatever instant the caller passes in
 * (today: openedAt in millis); kept generic rather than named
 * "fromOpenedAt" so it stays reusable if a future anchor is ever needed. */
export function computeCheckAfterMillis(anchorMillis: number, windowHours: number): number {
  return anchorMillis + windowHours * 3600 * 1000;
}

/** Pure — the inclusive window an outcome must fall inside to count as
 * attributable to this push. Both ends anchored on OPEN, never SEND —
 * this single function is the entire fix for the send-vs-open
 * misattribution bug; every outcome checker must filter through it (or an
 * equivalent Firestore range query built from its two bounds) and nothing
 * else. */
export function computeOutcomeWindowBounds(
  openedAtMillis: number,
  windowHours: number,
): { startMillis: number; endMillis: number } {
  return { startMillis: openedAtMillis, endMillis: computeCheckAfterMillis(openedAtMillis, windowHours) };
}

/** Pure — true iff `actionMillis` falls inside the open-anchored window.
 * Exists mainly so unit tests exercise the exact same boundary logic the
 * real Firestore range queries are built from, not a re-implementation of
 * it (the classic "test duplicates the logic instead of testing it" trap). */
export function isWithinOpenWindow(actionMillis: number, openedAtMillis: number, windowHours: number): boolean {
  const { startMillis, endMillis } = computeOutcomeWindowBounds(openedAtMillis, windowHours);
  return actionMillis >= startMillis && actionMillis <= endMillis;
}

/** Server-side write (Admin SDK — bypasses Firestore rules). Called from
 * push.service.ts's sendPush() when opts.measurement is provided.
 * checkAfter is deliberately `null` here — see module header. */
export async function writePushSentEvent(opts: WritePushSentOpts): Promise<void> {
  const windowHours = opts.outcomeWindowHours ?? DEFAULT_OUTCOME_WINDOW_HOURS;
  const now = admin.firestore.Timestamp.now();
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
      openedAt: null,
      checkAfter: null, // activated on open — see activateOutcomeWindow()
      outcomeChecked: false,
      createdAt: now,
    });
  } catch (err: unknown) {
    // Measurement is best-effort — never let a logging failure block the
    // actual push send (already completed by the time this is called).
    logger.warn(`[push-events] push_sent write failed pushId=${opts.pushId} uid=${opts.uid}`, err);
  }
}

/**
 * Called from onPushOpened.ts's Firestore trigger the moment a `push_opened`
 * event is written. Activates the outcome window on the SIBLING `push_sent`
 * doc (same pushId+uid) by stamping `openedAt` + a real `checkAfter`,
 * anchored on the open instant, not the send instant. Idempotent: re-running
 * with the same openedAt always computes the same checkAfter, so a trigger
 * retry is harmless.
 *
 * Returns false (and logs, does not throw) if the sibling push_sent doc is
 * missing — defensive only, should not happen in practice since push_opened
 * is only ever written client-side with a `pushId` that came from a real
 * sendPush() FCM payload.
 */
export async function activateOutcomeWindow(opts: {
  pushId: string;
  uid: string;
  openedAtMillis: number;
}): Promise<boolean> {
  const db = getDb();
  const sentRef = db.collection('push_events').doc(`${opts.pushId}_${opts.uid}_push_sent`);
  try {
    const sentSnap = await sentRef.get();
    if (!sentSnap.exists) {
      logger.warn(`[push-events] activateOutcomeWindow: no push_sent doc for pushId=${opts.pushId} uid=${opts.uid}`);
      return false;
    }
    const sentData = sentSnap.data() as Record<string, unknown>;
    const windowHours =
      typeof sentData.outcomeWindowHours === 'number' ? sentData.outcomeWindowHours : DEFAULT_OUTCOME_WINDOW_HOURS;
    const checkAfterMillis = computeCheckAfterMillis(opts.openedAtMillis, windowHours);
    await sentRef.update({
      openedAt: admin.firestore.Timestamp.fromMillis(opts.openedAtMillis),
      checkAfter: admin.firestore.Timestamp.fromMillis(checkAfterMillis),
    });
    return true;
  } catch (err: unknown) {
    logger.warn(`[push-events] activateOutcomeWindow failed pushId=${opts.pushId} uid=${opts.uid}`, err);
    return false;
  }
}

/** Server-side write for the outcome sweeper (pushOutcomeSweeper.ts).
 * `outcomeAchieved` is the generic name for what used to be `goalCompleted`
 * only — stored under the SAME field name for continuity with the 64 docs
 * already written before this fix (not a data-model change, just a wider
 * meaning for an existing boolean). `outcomeType` is new and additive,
 * recording which checker produced the verdict.
 *
 * `actionAt` (07.10.2026, push-performance instrumentation) is additive and
 * go-forward only — older docs simply lack it (read as `null`/absent, never
 * backfilled). It's the matched action's OWN timestamp (e.g. the workout's
 * `date`), distinct from `checkedAt` (when the sweeper happened to run).
 * Without it, "time to action" cannot be computed at all — `checkedAt` only
 * says when the sweep noticed, often tens of minutes after the real action.
 * Absent/null for outcome types with no real single-instant action to
 * report (e.g. `daily_step_goal` — see pushOutcomeSweeper.ts's own comment). */
export async function writePostPushOutcomeEvent(opts: {
  pushSentDoc: FirebaseFirestore.QueryDocumentSnapshot;
  outcomeAchieved: boolean;
  outcomeType: string;
  actionAt?: admin.firestore.Timestamp | null;
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
    goalCompleted: opts.outcomeAchieved,
    outcomeType: opts.outcomeType,
    actionAt: opts.actionAt ?? null,
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
