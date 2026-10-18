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
 *    6.  `dropoffNotifyCount` < MAX_DROPOFF_NOTIFICATIONS (2) — lifetime cap;
 *        a ghost user gets at most two of these, ever (before 17.10.2026 the
 *        counter was written but never read, so a user who never finished
 *        onboarding got one every RE_NOTIFY_HOURS indefinitely)
 *
 *  Candidates are read newest-first (`createdAt` DESC) so users who already
 *  hit the cap — they stay IN_PROGRESS forever — can't fill the batch and
 *  starve new drop-outs. Composite index: onboardingStatus ASC + createdAt DESC.
 *
 *  Quiet hours (22:00–07:00): the whole run exits early, on BOTH paths,
 *  before anything is read or stamped (so a skipped window never burns one
 *  of the user's two sends). Shabbat/yom tov (opt-in since 18.10.2026): only
 *  users with settings.shabbatObserver === true are skipped, in Step 2,
 *  before anything is stamped. The run is every 30 minutes, so the next
 *  eligible run picks the user up.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PUSH STRATEGY
 * ═══════════════════════════════════════════════════════════════════════
 *  Rather than going through the `push_messages` queue (which is designed
 *  for authority-scoped broadcast) we deliver via FCM multicast directly,
 *  exactly like `sendPushFromQueue` does — same token fan-out, same dead
 *  token pruning, same `MULTICAST_BATCH_SIZE = 500` ceiling.
 *
 *  Notification copy comes from the push library (push-copy.service.ts,
 *  pushType 'onboarding_dropoff'): the user's first name and audience,
 *  rotated per user per day, falling back to the code defaults. Both
 *  delivery paths below send the same resolved copy.
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
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 0 ITEM 1c — routing flag
 * ═══════════════════════════════════════════════════════════════════════
 *  Behind `app_config/feature_flags.pushRouting_onboardingDropoff` (default
 *  false): delivery routes through the shared `push.service.ts` (`sendPush()`)
 *  on the dedicated `'onboarding_dropoff'` channel — deliberately NOT
 *  `'training_reminder'` (which the legacy path below still self-tags for
 *  display), to avoid sharing trainingReminderScheduler's independent
 *  rate-cap clock on `push_rate/{uid}.training_reminder_lastSentAt`.
 *  `rateCapHours: 0` is passed because THIS dispatcher's own
 *  `dropoffNotifiedAt` cooldown (see AUDIT TRAIL above) is the real gate —
 *  not push.service.ts's generic cap, which stays intentionally unused here.
 *  Quiet hours are NOT skipped (since 17.10.2026 — previously skipQuietHours:
 *  true let this every-30-minutes cron push at 23:17 or 03:47).
 *  `dropoffNotifiedAt`/`dropoffNotifyCount` are stamped identically on both
 *  paths — this migration only changes the delivery mechanism, not the
 *  cooldown/audit-trail logic.
 *  Known minor side effect: Step 2's own eligibility filter still checks
 *  `notificationPrefs.training_reminder` regardless of routing (unchanged
 *  from before this migration); when routed, `sendPush()` ALSO
 *  independently checks `notificationPrefs.onboarding_dropoff`. A routed
 *  send is therefore gated on BOTH prefs — strictly more conservative
 *  (can only under-send, never over-send) than either check alone. Not
 *  fixed here — reconciling Step 2's filter to be routing-aware is out of
 *  this item's scope.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush, isQuietHours } from './services/push.service';
import { isShabbatObserver, isShabbatOrYomTov } from './services/shabbat.service';
import {
  resolvePushCopy,
  pushCopyData,
  audienceFromUserData,
  firstNameFromUserData,
} from './services/push-copy.service';
import type { PushAudience } from './shared/push-library.core';

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

/** Lifetime cap on drop-off pushes per user (criterion 6 in the header). */
export const MAX_DROPOFF_NOTIFICATIONS = 2;

// Deep-link that the native push handler navigates to on tap.
// /gateway is the app's onboarding resume entry: its onAuthStateChange
// listener (src/app/gateway/page.tsx) reads onboardingStatus/onboardingStep
// and sends an IN_PROGRESS user straight to their saved step (IDENTITY →
// profile, ASSESSMENT → assessment-visual, VISUAL_ASSESSMENT_COMPLETE/HEALTH
// → health), a finished user to /home, and leaves anyone else on the track
// picker. Was '/onboarding-new/selection' — deleted with the pre-08.2026
// onboarding chain (e806cb42), so every tap landed on a 404; next.config.mjs
// now redirects that old path here for pushes already delivered.
// The push library's only allowed route for 'onboarding_dropoff' is
// 'gateway' → this same path (pinned in pushDeepLinks.test.ts).
export const ONBOARDING_DROPOFF_DEEP_LINK = '/gateway';

// ─── Types (local mirrors of user.types.ts — Admin SDK doesn't import FE types) ─

interface StaleUser {
  uid: string;
  name: string;
  audience: PushAudience;
  authorityId: string | null;
  onboardingStep: string | null;
  tokens: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cutoffTimestamp(hours: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(Date.now() - hours * MS_PER_HOUR);
}

function toMillisLoose(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === 'object') {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

/**
 * Lifetime-cap + cooldown check for one user doc (criteria 5–6 in the
 * header). Returns a log-friendly skip reason, or null when the user may be
 * notified now. Exported for tests.
 */
export function dropoffCapSkipReason(
  data: Record<string, unknown>,
  nowMs: number = Date.now(),
): string | null {
  const count = typeof data.dropoffNotifyCount === 'number' ? data.dropoffNotifyCount : 0;
  if (count >= MAX_DROPOFF_NOTIFICATIONS) {
    return `lifetime cap reached (${count}/${MAX_DROPOFF_NOTIFICATIONS})`;
  }
  const notifiedMs = toMillisLoose(data.dropoffNotifiedAt);
  if (notifiedMs !== null && notifiedMs > nowMs - RE_NOTIFY_HOURS * MS_PER_HOUR) {
    return `notified ${Math.round((nowMs - notifiedMs) / MS_PER_HOUR)}h ago, cooldown=${RE_NOTIFY_HOURS}h`;
  }
  return null;
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

    // ── Step 0: quiet hours — skip the whole run (both paths) before
    // anything is read or stamped. See header.
    if (isQuietHours()) {
      logger.info('[dropoff] Quiet hours (22:00–07:00 Israel) — skipping run.');
      return;
    }
    // Shabbat/yom tov: observers only (settings.shabbatObserver) — filtered
    // per user in Step 2 below; everyone else gets the nudge as on any day.
    const inShabbatWindow = isShabbatOrYomTov();

    const staleBefore = cutoffTimestamp(STALE_HOURS);

    // Phase 0 Item 1c — routing flag; a read failure here is non-fatal, it
    // just means this run falls back to the legacy inline path (flag=false).
    let useSharedPushService = false;
    try {
      const flagsSnap = await db.doc('app_config/feature_flags').get();
      useSharedPushService =
        (flagsSnap.data() as Record<string, unknown> | undefined)
          ?.pushRouting_onboardingDropoff === true;
    } catch (err: any) {
      logger.warn('[dropoff] routing flag read failed, using legacy path:', err?.message);
    }

    logger.info(
      `[dropoff] Query window: createdAt < ${staleBefore.toDate().toISOString()} ` +
        `(${STALE_HOURS}h ago), limit=${BATCH_LIMIT}`,
    );

    // ── Step 1: Query stale onboarding users ────────────────────────────
    // Composite index registered in firestore.indexes.json:
    //   onboardingStatus ASC + createdAt DESC (COLLECTION scope) — newest
    //   first, so capped users can't starve new drop-outs (see header).
    let candidateDocs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('users')
        .where('onboardingStatus', 'in', ['IN_PROGRESS', 'ONBOARDING'])
        .where('createdAt', '<=', staleBefore)
        .orderBy('createdAt', 'desc')
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

      // Lifetime cap + cooldown guard.
      const capReason = dropoffCapSkipReason(data);
      if (capReason) {
        logger.info(`[dropoff] uid=${uid} — skipping (${capReason})`);
        continue;
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

      // Shabbat/yom tov — before anything is stamped, so the user is simply
      // picked up by the first run after havdalah.
      if (inShabbatWindow && isShabbatObserver(data?.settings)) {
        logger.info(`[dropoff] uid=${uid} — skipping (Shabbat observer, Shabbat/yom tov)`);
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
        name: firstNameFromUserData(data),
        audience: audienceFromUserData(data),
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
      const copy = await resolvePushCopy('onboarding_dropoff', {
        uid: user.uid,
        audience: user.audience,
        vars: { '@שם': user.name },
      });
      if (!copy) {
        logger.warn(`[dropoff] uid=${user.uid} — no push copy fits, skipping`);
        continue;
      }
      const { title, body, deepLink } = copy;

      logger.info(
        `[dropoff] Dispatching uid=${user.uid} name="${user.name}" ` +
          `step=${user.onboardingStep ?? 'unknown'} ` +
          `tokens=${user.tokens.length} row=${copy.rowId}`,
      );

      if (TEST_MODE) {
        logger.warn(
          `[dropoff] TEST_MODE — would send: title="${title}" body="${body}" ` +
            `deep_link=${deepLink} tokens=${user.tokens.join(', ')}`,
        );
        totalSkipped += 1;
        continue;
      }

      let userDelivered = 0;
      let userFailed = 0;

      if (useSharedPushService) {
        // ── Routed path (Phase 0 Item 1c) — delivery via the shared
        // push.service.ts, gated behind pushRouting_onboardingDropoff
        // (default false). See header comment for the channel/rate-cap
        // reasoning.
        const result = await sendPush({
          toUids: [user.uid],
          channel: 'onboarding_dropoff',
          title,
          body,
          deepLink,
          data: {
            triggerType: 'Inactivity',
            onboardingStep: user.onboardingStep ?? '',
            ...(user.authorityId ? { authorityId: user.authorityId } : {}),
            ...pushCopyData(copy),
          },
          rateCapHours: 0,
        });
        userDelivered = result.delivered;
        userFailed = result.failed;
        totalTokensPruned += result.tokensPruned;
        logger.info(
          `[dropoff] (routed) uid=${user.uid} — delivered=${userDelivered} ` +
            `failed=${userFailed} skippedGlobalKill=${result.skippedGlobalKill} ` +
            `pruned=${result.tokensPruned}`,
        );
      } else {
        // ── Legacy path — direct FCM, active while pushRouting_onboardingDropoff
        // is false.
        const fcmMessage: admin.messaging.MulticastMessage = {
          tokens: [],
          notification: { title, body },
          data: {
            channel: 'training_reminder',
            triggerType: 'Inactivity',
            deepLink,
            onboardingStep: user.onboardingStep ?? '',
            ...(user.authorityId ? { authorityId: user.authorityId } : {}),
            ...pushCopyData(copy),
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

        logger.info(
          `[dropoff] uid=${user.uid} — delivered=${userDelivered} ` +
            `failed=${userFailed} deadPruned=${userDeadTokens.length}`,
        );
      }

      // Stamp audit field on user doc — unconditional, both paths.
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
