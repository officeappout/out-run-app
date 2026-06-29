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
 * COPY TEMPLATES (placeholder — Hebrew copy to be finalised separately):
 *   Single kudos:
 *     title: "{sender_name} שלח/ה לך {kudo_emoji}!"
 *     body:  "פתח/י את האפליקציה לראות."
 *   Batched kudos (count > 1):
 *     title: "קיבלת {kudos_count} {kudo_emoji}!"
 *     body:  "{sender_name} ועוד אחרים שלחו לך."
 *
 * CHANNEL: 'social' — respects users' `notificationPrefs.social` setting.
 * RATE CAP: RATE_CAP_MINUTES (see constant below); configurable for testing.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

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

/** Emoji per kudo type — extend when new types are added. */
const KUDO_EMOJI: Record<string, string> = {
  high_five: '🤚',
};

// ─── Copy templates (placeholder) ────────────────────────────────────────────

function buildMessage(
  unreadCount: number,
  senderName: string,
  kudoType: string,
): { title: string; body: string } {
  const emoji = KUDO_EMOJI[kudoType] ?? '⭐';

  if (unreadCount <= 1) {
    return {
      title: `{sender_name} שלח/ה לך ${emoji}!`
        .replace('{sender_name}', senderName),
      body: 'פתח/י את האפליקציה לראות.',
    };
  }

  return {
    title: `קיבלת {kudos_count} ${emoji}!`
      .replace('{kudos_count}', String(unreadCount)),
    body: `{sender_name} ועוד {others_count} שלחו לך.`
      .replace('{sender_name}', senderName)
      .replace('{others_count}', String(unreadCount - 1)),
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

    const { title, body } = buildMessage(unreadCount, senderName, kudoType);

    try {
      const result = await sendPush({
        toUids: [recipientUid],
        channel: 'social',
        title,
        body,
        deepLink: '/activity',
        data: {
          triggerType: 'Kudos',
          kudoType,
          unreadCount: String(unreadCount),
          senderName,
        },
        rateCapHours: RATE_CAP_HOURS,
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
