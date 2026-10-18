/**
 * onKudosCreated — Push notification on new kudos (high-five) received.
 *
 * Trigger: onCreate kudos/{recipientUid}/inbox/{kudoId}
 *
 * BATCHING STRATEGY
 * ─────────────────
 * A popular user can receive many kudos in rapid succession; we must NOT send
 * one push per kudo. Two-layer defence:
 *
 *  1. COUNT — on each trigger, query the total unread-kudos count for the
 *     recipient (Firestore count aggregation). The push body always reflects
 *     the up-to-date batch size, not just the single kudo that fired the trigger.
 *
 *  2. RATE CAP — push.service.ts enforces a RATE_CAP_MINUTES-minute window per
 *     (uid, channel='social'). If a push was sent within the window, all
 *     subsequent triggers are silently dropped. This guarantees:
 *       • at most 1 push per RATE_CAP_MINUTES minutes, regardless of kudo volume
 *       • the FIRST push in each window shows the real cumulative count
 *
 * Example:
 *   12:00:00 — kudo #1 arrives, count=1 → push "1 kudos from {sender_name}" — SENT
 *   12:00:01 — kudo #2 arrives, count=2 → rate-capped — SKIPPED
 *   12:00:05 — kudo #10 arrives → rate-capped — SKIPPED
 *   12:31:00 — kudo #11 arrives, count=11 (all unread) → "11 kudos" — SENT
 *
 * COPY: the push library (push-copy.service.ts) — pushType 'kudos_single'
 * (one unread) or 'kudos_bundle' (several; condition others = one|many, so
 * "ועוד מישהו" reads right when exactly one other person sent one).
 *
 * CHANNEL: 'social' — respects users' `notificationPrefs.social` setting.
 * RATE CAP: RATE_CAP_MINUTES (see constant below); configurable for testing.
 * Sends isPersonalInteraction: true (Stage 2, 08.09.2026) — exempt from
 * push.service.ts's daily engagement cap, same treatment as chat.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolvePushCopy, pushCopyData, loadPushRecipient } from './services/push-copy.service';
import type { PushCopyContext } from './shared/push-library.core';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────

/** Rate-cap window in hours. Env override for testing: KUDOS_RATE_CAP_HOURS */
const RATE_CAP_HOURS = (() => {
  const raw = Number(process.env.KUDOS_RATE_CAP_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.5; // 30 min default
})();

/** pushType + context for the current unread count. Exported for tests. */
export function kudosCopyRequest(
  recipientUid: string,
  unreadCount: number,
  senderName: string,
  recipient: { firstName: string; audience: PushCopyContext['audience'] },
): { pushType: 'kudos_single' | 'kudos_bundle'; ctx: PushCopyContext } {
  const others = Math.max(0, unreadCount - 1);
  return {
    pushType: unreadCount <= 1 ? 'kudos_single' : 'kudos_bundle',
    ctx: {
      uid: recipientUid,
      audience: recipient.audience,
      vars: {
        '@שם': recipient.firstName,
        '@שולח': senderName,
        '@כמות': String(unreadCount),
        '@עוד': String(others),
      },
      conditions: { others: others === 1 ? 'one' : 'many' },
    },
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const onKudosCreated = onDocumentCreated(
  {
    document: 'kudos/{recipientUid}/inbox/{kudoId}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const { recipientUid, kudoId } = event.params;
    const kudoData = event.data?.data() as {
      fromUid?: string;
      fromName?: string;
      type?: string;
    } | undefined;

    if (!kudoData) {
      logger.warn(`[onKudosCreated] empty payload for kudoId=${kudoId}`);
      return;
    }

    const senderName = String(kudoData.fromName ?? 'מישהו');
    const kudoType   = String(kudoData.type ?? 'high_five');

    // Guard: don't push self-kudos (shouldn't happen but defensive)
    if (kudoData.fromUid === recipientUid) {
      logger.info(`[onKudosCreated] self-kudo uid=${recipientUid} — skip`);
      return;
    }

    // ── Count all unread kudos for this recipient (including the new one) ───
    let unreadCount = 1;
    try {
      const countSnap = await db
        .collection('kudos')
        .doc(recipientUid)
        .collection('inbox')
        .where('read', '==', false)
        .count()
        .get();
      unreadCount = countSnap.data().count;
    } catch (err) {
      // count() might be unsupported in older emulator versions — fall back to 1
      logger.warn('[onKudosCreated] count aggregation failed, using 1', err);
      unreadCount = 1;
    }

    try {
      const recipient = await loadPushRecipient(recipientUid);
      const { pushType, ctx } = kudosCopyRequest(recipientUid, unreadCount, senderName, recipient);
      const copy = await resolvePushCopy(pushType, ctx);
      if (!copy) return;
      const result = await sendPush({
        toUids: [recipientUid],
        channel: 'social',
        title: copy.title,
        body: copy.body,
        // '/home' by default (was '/activity', which never existed). The kudos
        // inbox is the global ActivityPanel opened from AppHeader's bell on
        // /home; next.config.mjs redirects /activity → /home for old pushes.
        deepLink: copy.deepLink,
        data: {
          triggerType: 'Kudos',
          kudoType,
          unreadCount: String(unreadCount),
          senderName,
          ...pushCopyData(copy),
        },
        rateCapHours: RATE_CAP_HOURS,
        // Stage 2 — a kudos is someone else reacting to this user's workout,
        // the canonical PERSONAL-interaction event. Exempt from the daily
        // engagement cap (its own per-channel rate cap above is untouched).
        isPersonalInteraction: true,
      });

      logger.info(
        `[onKudosCreated] uid=${recipientUid} unread=${unreadCount} ` +
          `result=${JSON.stringify(result)}`,
      );
    } catch (err) {
      logger.error('[onKudosCreated] sendPush failed', err);
    }
  },
);
