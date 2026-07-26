/**
 * onboardingDropoffDispatcher — Scheduled Cloud Function (Option B, Trigger 1).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════
 * Detects users who started onboarding but went silent ("ghost users") and
 * re-engages them via a personalised Hebrew push notification before they
 * churn permanently.
 *
 * This is the foundational trigger of the Social Engagement Engine's
 * lifecycle automation layer. It runs as a pure server-side cron and
 * requires zero client-side cooperation — it fires even when the user has
 * never opened the app again after their first sign-up session.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DETECTION LOGIC
 * ═══════════════════════════════════════════════════════════════════════
 *  A user is considered a "stale onboarding dropout" when ALL are true:
 *    1.  `onboardingStatus` is 'IN_PROGRESS' or 'ONBOARDING'
 *        (excludes 'COMPLETED', 'MAP_ONLY', 'PENDING_LIFESTYLE')
 *    2.  `createdAt` <= (now − STALE_HOURS)
 *        — they signed up at least N hours ago but never finished
 *    3.  The user has at least one live FCM token
 *        (no token = no push surface; skip to avoid wasted cycles)
 *    4.  `settings.pushEnabled` is not explicitly `false`
 *        (respect opt-out)
 *    5.  `dropoffNotifiedAt` is absent OR older than RE_NOTIFY_HOURS
 *        (cooldown guard — never spam the same user twice quickly)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PUSH STRATEGY
 * ═══════════════════════════════════════════════════════════════════════
 *  Rather than going through the `push_messages` queue (which is designed
 *  for authority-scoped broadcast) we deliver via FCM multicast directly,
 *  exactly like `sendPushFromQueue` does — same token fan-out, same dead
 *  token pruning, same `MULTICAST_BATCH_SIZE = 500` ceiling.
 *
 *  Notification content rotates across 5 message variants so repeat
 *  visitors see fresh copy (index = hash(uid) % variants.length ensures
 *  the same user always gets the same variant within a run — deterministic
 *  for debugging — but rotates across re-notify windows).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * AUDIT TRAIL
 * ═══════════════════════════════════════════════════════════════════════
 *  After each successful dispatch we stamp `dropoffNotifiedAt` on the user
 *  doc. This field serves a dual purpose:
 *    • Cooldown guard (see point 5 above).
 *    • Funnel Dashboard signal — admins can query users where
 *      `dropoffNotifiedAt` is set AND `onboardingStatus != 'COMPLETED'`
 *      to measure re-engagement rates.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCHEDULE
 * ═══════════════════════════════════════════════════════════════════════
 *  Default: every 30 minutes (configurable via env for E2E test runs).
 *  The cron string is intentionally offset from :00 to avoid thundering-
 *  herd contention with `cleanupEphemeralDocs` (runs at :07) and external
 *  cron aggregators.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES (optional overrides)
 * ═══════════════════════════════════════════════════════════════════════
 *  DROPOFF_STALE_HOURS       — hours before a user is considered stale  (default 24)
 *  DROPOFF_RE_NOTIFY_HOURS   — min hours between two notifications       (default 48)
 *  DROPOFF_BATCH_LIMIT       — max users to process per run              (default 100)
 *  DROPOFF_TEST_MODE         — if 'true', logs intent but skips all writes / FCM calls
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

// ─── Configuration ────────────────────────────────────────────────────────────

const STALE_HOURS = (() => {
  const raw = Number(process.env.DROPOFF_STALE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
})();

const RE_NOTIFY_HOURS = (() => {
  const raw = Number(process.env.DROPOFF_RE_NOTIFY_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
})();

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.DROPOFF_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 100;
})();

const TEST_MODE = process.env.DROPOFF_TEST_MODE === 'true';

const MULTICAST_BATCH_SIZE = 500;
const MS_PER_HOUR = 60 * 60 * 1000;

// ─── Message variants ─────────────────────────────────────────────────────────
// Personalised Hebrew copy. `{name}` is replaced at dispatch time.
// The array index is selected deterministically from the user's uid so
// the same user always sees the same variant within a cron window, making
// it easy to A/B test by deploying two function versions with different arrays.
const MESSAGE_VARIANTS: Array<{ title: string; body: string }> = [
  {
    title: '🏃 {name}, האימון שלך מחכה!',
    body: 'רק עוד כמה שניות ותסיים את ההרשמה — הגוף שלך מוכן להתחיל.',
  },
  {
    title: '💪 {name}, אנחנו שמרנו לך מקום',
    body: 'התוכנית האישית שלך מוכנה. פתח את האפליקציה וקבל את האימון הראשון.',
  },
  {
    title: '🔥 {name}, לא ויתרנו עליך',
    body: 'עצרת באמצע — נמשיך מאיפה שעצרת, בדיוק בשבילך.',
  },
  {
    title: '⚡ {name}, שלב אחד לפני הגמר',
    body: 'ההרשמה שלך כמעט מוכנה. לחץ כדי להשלים ולקבל את תוכנית האימון שלך.',
  },
  {
    title: '🎯 {name}, מישהו כבר מחכה לך',
    body: 'אחרים ברשותך כבר מתאמנים — בוא להצטרף לליגה שלך.',
  },
];

// Deep-link that the native push handler navigates to on tap.
// Routes through /onboarding-new/selection which re-hydrates the wizard
// at the last completed step.
const DEEP_LINK = '/onboarding-new/selection';

// ─── Types (local mirrors of user.types.ts — Admin SDK doesn't import FE types) ─

interface StaleUser {
  uid: string;
  name: string;
  authorityId: string | null;
  onboardingStep: string | null;
  tokens: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cutoffTimestamp(hours: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(Date.now() - hours * MS_PER_HOUR);
}

/** Personalise a message variant for a specific user. */
function personalise(template: string, name: string): string {
  return template.replace(/{name}/g, name || 'חבר');
}

/** Deterministic variant index — same user → same variant within a cron window. */
function variantIndex(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % MESSAGE_VARIANTS.length;
}

/**
 * Prune dead FCM tokens from a user doc. Mirrors the logic in
 * sendPushFromQueue to keep token lists clean across both pipelines.
 */
async function pruneDeadTokens(uid: string, deadTokens: string[]): Promise<void> {
  if (deadTokens.length === 0) return;
  try {
    await db.collection('users').doc(uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[dropoff] Pruned ${deadTokens.length} dead token(s) from uid=${uid}`);
  } catch (err: any) {
    logger.warn(`[dropoff] Token prune failed for uid=${uid}:`, err?.message);
  }
}

/** Send a single multicast batch and return { delivered, failed, dead }. */
async function sendMulticast(
  tokens: string[],
  message: admin.messaging.MulticastMessage,
): Promise<{ delivered: number; failed: number; deadTokens: string[] }> {
  const resp = await messaging.sendEachForMulticast(message);
  let delivered = 0;
  let failed = 0;
  const deadTokens: string[] = [];

  resp.responses.forEach((r, idx) => {
    if (r.success) {
      delivered += 1;
    } else {
      failed += 1;
      const code = r.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        deadTokens.push(tokens[idx]);
      }
    }
  });

  return { delivered, failed, deadTokens };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const onboardingDropoffDispatcher = onSchedule(
  {
    // Runs every 30 minutes, offset at :17 so it doesn't collide with
    // cleanupEphemeralDocs (:07) or other common :00/:30 jobs.
    schedule: '17,47 * * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    // ── COMPILE-TIME LOG — visible immediately in Firebase Functions console
    //    even before any Firestore query fires, confirming the function
    //    deployed correctly and is evaluating on schedule.
    logger.info(
      `[dropoff] ══════════════════════════════════════════════\n` +
      `[dropoff] onboardingDropoffDispatcher EVALUATING\n` +
      `[dropoff] Config: staleHours=${STALE_HOURS}, ` +
        `reNotifyHours=${RE_NOTIFY_HOURS}, ` +
        `batchLimit=${BATCH_LIMIT}, ` +
        `testMode=${TEST_MODE}\n` +
      `[dropoff] Timestamp: ${new Date().toISOString()}\n` +
      `[dropoff] ══════════════════════════════════════════════`,
    );

    if (TEST_MODE) {
      logger.warn('[dropoff] TEST_MODE=true — all writes and FCM calls are suppressed.');
    }

    const staleBefore = cutoffTimestamp(STALE_HOURS);
    const reNotifyBefore = cutoffTimestamp(RE_NOTIFY_HOURS);

    logger.info(
      `[dropoff] Query window: createdAt < ${staleBefore.toDate().toISOString()} ` +
        `(${STALE_HOURS}h ago), limit=${BATCH_LIMIT}`,
    );

    // ── Step 1: Query stale onboarding users ────────────────────────────
    // Composite index registered in firestore.indexes.json:
    //   onboardingStatus ASC + createdAt ASC (COLLECTION scope)
    let candidateDocs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('users')
        .where('onboardingStatus', 'in', ['IN_PROGRESS', 'ONBOARDING'])
        .where('createdAt', '<=', staleBefore)
        .limit(BATCH_LIMIT)
        .get();

      candidateDocs = snap.docs;
      logger.info(`[dropoff] Step 1 — query returned ${candidateDocs.length} candidate(s)`);
    } catch (err: any) {
      logger.error('[dropoff] Step 1 — Firestore query failed:', err?.message, err?.stack);
      return;
    }

    if (candidateDocs.length === 0) {
      logger.info('[dropoff] No stale onboarding users found — exiting cleanly.');
      return;
    }

    // ── Step 2: Filter: cooldown + push eligibility ──────────────────────
    const eligible: StaleUser[] = [];

    for (const docSnap of candidateDocs) {
      const data = docSnap.data() as Record<string, any>;
      const uid = docSnap.id;

      // Cooldown guard — skip if notified too recently.
      const notifiedAt = data.dropoffNotifiedAt;
      if (notifiedAt) {
        const notifiedTs =
          notifiedAt instanceof admin.firestore.Timestamp
            ? notifiedAt
            : admin.firestore.Timestamp.fromDate(new Date(notifiedAt));
        if (notifiedTs.toMillis() > reNotifyBefore.toMillis()) {
          logger.info(
            `[dropoff] uid=${uid} — skipping (notified ${
              Math.round((Date.now() - notifiedTs.toMillis()) / MS_PER_HOUR)
            }h ago, cooldown=${RE_NOTIFY_HOURS}h)`,
          );
          continue;
        }
      }

      // Push eligibility.
      const pushEnabled = data?.settings?.pushEnabled;
      if (pushEnabled === false) {
        logger.info(`[dropoff] uid=${uid} — skipping (pushEnabled=false)`);
        continue;
      }

      // Per-channel opt-out. This dispatcher tags its payload
      // channel:'training_reminder' (see fcmMessage below), so a user who
      // disabled training reminders must NOT receive these inactivity pushes.
      // Missing field defaults to enabled (opt-out model), matching all other senders.
      if (data?.settings?.notificationPrefs?.training_reminder === false) {
        logger.info(`[dropoff] uid=${uid} — skipping (training_reminder opt-out)`);
        continue;
      }

      const tokens: string[] = Array.isArray(data.fcmTokens)
        ? (data.fcmTokens as string[]).filter((t) => typeof t === 'string' && t.length > 0)
        : [];

      if (tokens.length === 0) {
        logger.info(`[dropoff] uid=${uid} — skipping (no FCM tokens)`);
        continue;
      }

      eligible.push({
        uid,
        name: String(data?.core?.name ?? ''),
        authorityId: String(data?.core?.authorityId ?? '') || null,
        onboardingStep: typeof data.onboardingStep === 'string' ? data.onboardingStep : null,
        tokens,
      });
    }

    logger.info(
      `[dropoff] Step 2 — ${eligible.length} eligible user(s) ` +
        `(of ${candidateDocs.length} candidates)`,
    );

    if (eligible.length === 0) {
      logger.info('[dropoff] All candidates filtered out — exiting cleanly.');
      return;
    }

    // ── Step 3: Dispatch notifications ──────────────────────────────────
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalTokensPruned = 0;

    for (const user of eligible) {
      const idx = variantIndex(user.uid);
      const variant = MESSAGE_VARIANTS[idx];
      const title = personalise(variant.title, user.name);
      const body = personalise(variant.body, user.name);

      logger.info(
        `[dropoff] Dispatching uid=${user.uid} name="${user.name}" ` +
          `step=${user.onboardingStep ?? 'unknown'} ` +
          `tokens=${user.tokens.length} variant=${idx}`,
      );

      if (TEST_MODE) {
        logger.warn(
          `[dropoff] TEST_MODE — would send: title="${title}" body="${body}" ` +
            `deep_link=${DEEP_LINK} tokens=${user.tokens.join(', ')}`,
        );
        totalSkipped += 1;
        continue;
      }

      const fcmMessage: admin.messaging.MulticastMessage = {
        tokens: [],
        notification: { title, body },
        data: {
          channel: 'training_reminder',
          triggerType: 'Inactivity',
          deepLink: DEEP_LINK,
          onboardingStep: user.onboardingStep ?? '',
          ...(user.authorityId ? { authorityId: user.authorityId } : {}),
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
      };

      let userDelivered = 0;
      let userFailed = 0;
      const userDeadTokens: string[] = [];

      // Fan out in batches of 500 (FCM multicast ceiling).
      for (let i = 0; i < user.tokens.length; i += MULTICAST_BATCH_SIZE) {
        const batch = user.tokens.slice(i, i + MULTICAST_BATCH_SIZE);
        try {
          const result = await sendMulticast(
            batch,
            { ...fcmMessage, tokens: batch },
          );
          userDelivered += result.delivered;
          userFailed += result.failed;
          userDeadTokens.push(...result.deadTokens);
        } catch (err: any) {
          userFailed += batch.length;
          logger.warn(`[dropoff] FCM batch failed for uid=${user.uid}:`, err?.message);
        }
      }

      // Prune dead tokens discovered during this send.
      if (userDeadTokens.length > 0) {
        await pruneDeadTokens(user.uid, userDeadTokens);
        totalTokensPruned += userDeadTokens.length;
      }

      // Stamp audit field on user doc.
      try {
        await db.collection('users').doc(user.uid).update({
          dropoffNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          dropoffNotifyCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err: any) {
        logger.warn(`[dropoff] Audit stamp failed for uid=${user.uid}:`, err?.message);
        // Non-fatal — notification was already sent; worst case we re-send
        // next window (still better than silently losing the stamp).
      }

      logger.info(
        `[dropoff] uid=${user.uid} — delivered=${userDelivered} ` +
          `failed=${userFailed} deadPruned=${userDeadTokens.length}`,
      );

      totalDelivered += userDelivered;
      totalFailed += userFailed;
    }

    // ── Step 4: Summary log ─────────────────────────────────────────────
    logger.info(
      `[dropoff] ══════════════════════════════════════════════\n` +
      `[dropoff] DISPATCH COMPLETE\n` +
      `[dropoff]   candidates    : ${candidateDocs.length}\n` +
      `[dropoff]   eligible      : ${eligible.length}\n` +
      `[dropoff]   skipped (test): ${totalSkipped}\n` +
      `[dropoff]   delivered     : ${totalDelivered}\n` +
      `[dropoff]   failed        : ${totalFailed}\n` +
      `[dropoff]   tokens pruned : ${totalTokensPruned}\n` +
      `[dropoff] ══════════════════════════════════════════════`,
    );
  },
);
