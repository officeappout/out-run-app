/**
 * chatMessageNotification — Cloud Function
 *
 * Trigger: Firestore `onCreate` on `chats/{chatId}/messages/{messageId}`.
 *
 * Sends a push notification to every participant in the chat thread except
 * the sender, provided the global `chatNotificationsEnabled` flag stored in
 * `app_config/feature_flags` is `true`.
 *
 * Pipeline
 * ────────
 * 1. Guard: bail early if `app_config/feature_flags.chatNotificationsEnabled !== true`.
 * 2. Read the parent `chats/{chatId}` document to resolve the recipient list
 *    (all participants except the sender).
 * 3. Fetch each recipient's user doc; apply per-user push preferences:
 *       settings.pushEnabled !== false
 *       settings.notificationPrefs.chat !== false
 *    Missing fields default to `true` so legacy users keep receiving pushes.
 * 4. Multicast via FCM in batches of 500 (FCM cap).
 *    Dead tokens (`messaging/registration-token-not-registered`, etc.) are
 *    removed from the owning user doc exactly as `sendPushFromQueue` does.
 * 5. Log delivery stats.
 *
 * Deep-link payload: `/chat/{chatId}` — the native push handler in
 * `src/lib/native/push.ts` navigates the web view to this path on tap.
 */

import * as functions from 'firebase-functions';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const FEATURE_FLAGS_DOC = 'app_config/feature_flags';
const MULTICAST_BATCH_SIZE = 500;
const TEXT_SNIPPET_MAX = 100;

interface MessageDoc {
  senderUid?: unknown;
  senderName?: unknown;
  text?: unknown;
  type?: unknown;
}

interface ChatDoc {
  participants?: unknown;
}

export const chatMessageNotification = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .firestore.document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const chatId = context.params.chatId as string;
    const data = snap.data() as MessageDoc | undefined;

    if (!data) {
      logger.warn('[chatMessageNotification] empty message doc, skipping');
      return;
    }

    const senderUid = typeof data.senderUid === 'string' ? data.senderUid.trim() : '';
    const senderName =
      typeof data.senderName === 'string' && data.senderName.trim()
        ? data.senderName.trim()
        : 'מישהו';
    const text = typeof data.text === 'string' ? data.text.trim() : '';

    if (!senderUid) {
      logger.warn(`[chatMessageNotification] missing senderUid in chat ${chatId}`);
      return;
    }

    // ── Step 1: Check global feature flag ──────────────────────────────────
    const [flagsRef, chatRef] = [db.doc(FEATURE_FLAGS_DOC), db.collection('chats').doc(chatId)];

    const [flagsSnap, chatSnap] = await Promise.all([flagsRef.get(), chatRef.get()]);

    const chatNotificationsEnabled =
      (flagsSnap.data() as Record<string, unknown> | undefined)?.chatNotificationsEnabled === true;

    if (!chatNotificationsEnabled) {
      logger.info('[chatMessageNotification] chatNotificationsEnabled=false, skipping');
      return;
    }

    // ── Step 2: Resolve recipient UIDs ─────────────────────────────────────
    if (!chatSnap.exists) {
      logger.warn(`[chatMessageNotification] chat doc ${chatId} not found`);
      return;
    }

    const chatData = chatSnap.data() as ChatDoc;
    const participants = Array.isArray(chatData.participants)
      ? (chatData.participants as string[])
      : [];
    const recipientUids = participants.filter(
      (uid) => typeof uid === 'string' && uid !== senderUid,
    );

    if (recipientUids.length === 0) {
      logger.info(`[chatMessageNotification] no recipients in chat ${chatId}`);
      return;
    }

    // ── Step 3: Collect valid FCM tokens, respecting per-user prefs ────────
    const tokenSet = new Set<string>();
    const tokenOwners = new Map<string, string>();

    const userRefs = recipientUids.map((uid) => db.collection('users').doc(uid));
    const userDocs = await db.getAll(...userRefs);

    userDocs.forEach((d) => {
      if (!d.exists) return;
      const ud = d.data() as Record<string, unknown>;
      const settings = (ud?.settings ?? {}) as Record<string, unknown>;

      if (settings.pushEnabled === false) return;

      const notifPrefs = (settings.notificationPrefs ?? {}) as Record<string, unknown>;
      if (notifPrefs.chat === false) return;

      const tokens = ud?.fcmTokens;
      if (!Array.isArray(tokens)) return;
      tokens.forEach((t: unknown) => {
        if (typeof t !== 'string' || t.length === 0) return;
        if (!tokenSet.has(t)) {
          tokenSet.add(t);
          tokenOwners.set(t, d.id);
        }
      });
    });

    const tokenList = Array.from(tokenSet);

    if (tokenList.length === 0) {
      logger.info(`[chatMessageNotification] no valid tokens for recipients in ${chatId}`);
      return;
    }

    // ── Step 4: Build FCM multicast message ────────────────────────────────
    const bodyText =
      text.length > TEXT_SNIPPET_MAX ? `${text.slice(0, TEXT_SNIPPET_MAX)}...` : text;

    const messageBase: admin.messaging.MulticastMessage = {
      tokens: [],
      notification: {
        title: senderName,
        body: bodyText || '💬 הודעה חדשה',
      },
      data: {
        chatId,
        deepLink: `/chat/${chatId}`,
        channel: 'chat',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
        },
      },
    };

    let deliveredCount = 0;
    let failedCount = 0;
    const tokensToRemove: string[] = [];

    for (let i = 0; i < tokenList.length; i += MULTICAST_BATCH_SIZE) {
      const batch = tokenList.slice(i, i + MULTICAST_BATCH_SIZE);
      try {
        const response = await messaging.sendEachForMulticast({ ...messageBase, tokens: batch });
        response.responses.forEach((resp, idx) => {
          if (resp.success) {
            deliveredCount += 1;
          } else {
            failedCount += 1;
            const code = resp.error?.code ?? '';
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/invalid-argument'
            ) {
              tokensToRemove.push(batch[idx]);
            }
          }
        });
      } catch (e: unknown) {
        failedCount += batch.length;
        logger.warn('[chatMessageNotification] batch send failed', e);
      }
    }

    // ── Step 5: Prune dead tokens ───────────────────────────────────────────
    if (tokensToRemove.length > 0) {
      const byOwner = new Map<string, string[]>();
      tokensToRemove.forEach((t) => {
        const uid = tokenOwners.get(t);
        if (!uid) return;
        if (!byOwner.has(uid)) byOwner.set(uid, []);
        byOwner.get(uid)!.push(t);
      });

      const writers = Array.from(byOwner.entries());
      for (let i = 0; i < writers.length; i += 400) {
        const slice = writers.slice(i, i + 400);
        const writeBatch = db.batch();
        slice.forEach(([uid, deadTokens]) => {
          const ref = db.collection('users').doc(uid);
          const update: Record<string, unknown> = {
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          deadTokens.forEach((t) => {
            update[`fcmTokenMeta.${t}`] = admin.firestore.FieldValue.delete();
          });
          writeBatch.update(ref, update);
        });
        try {
          await writeBatch.commit();
        } catch (e: unknown) {
          logger.warn('[chatMessageNotification] token prune batch failed', e);
        }
      }
    }

    logger.info(
      `[chatMessageNotification] ${chatId} done: delivered=${deliveredCount} ` +
        `failed=${failedCount} pruned=${tokensToRemove.length}`,
    );
  });
