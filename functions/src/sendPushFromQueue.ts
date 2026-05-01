/**
 * sendPushFromQueue — Cloud Function (Sprint 3, Phase 4.5).
 *
 * Trigger: Firestore `onCreate` for `push_messages/{messageId}`.
 *
 * Pipeline
 * ────────
 * 1. Mark the queue doc `status = 'processing'` so a duplicate
 *    invocation (functions retry, double-write race) bails out early.
 * 2. Resolve the audience (`all` | `park_users` | `active_users` |
 *    `inactive_users`) into a Set<uid> within the message's authority.
 *    Authority scoping is mandatory — an admin in city A may NEVER
 *    push to a user in city B even if they accidentally use 'all'.
 * 3. Filter users by their notification preferences:
 *       settings.pushEnabled !== false
 *       settings.notificationPrefs.{channel} !== false
 *    Missing fields default to `true` so legacy users keep receiving
 *    pushes. The `system` channel is treated as force-on (never
 *    filtered) so account-security messages always land.
 * 4. Collect every `users/{uid}.fcmTokens` entry, dedupe across
 *    devices.
 * 5. Multicast in batches of 500 (the FCM cap for sendEachForMulticast).
 *    Each response item that returns `messaging/registration-token-not-
 *    registered` (or invalid-argument) is treated as a dead handle and
 *    the token is removed from the owning user doc to keep future
 *    deliveries cheap and avoid quota waste.
 * 6. Update the queue doc with `status = 'sent'` (or `'failed'`),
 *    `deliveredCount`, `failedCount`, `processedAt`,
 *    `tokensRemoved`, and `error` (if any).
 *
 * The function is idempotent on retry: step 1's compare-and-set on
 * `status` keeps Cloud Functions' at-least-once delivery from sending
 * a notification twice when the function times out and retries.
 */

import * as functions from 'firebase-functions';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const MULTICAST_BATCH_SIZE = 500;
const ACTIVE_WINDOW_DAYS = 7;
const INACTIVE_WINDOW_DAYS = 14;
const PARK_VISIT_WINDOW_DAYS = 30;

type TargetAudience = 'all' | 'park_users' | 'active_users' | 'inactive_users';
type PushChannel =
  | 'encouragement'
  | 'health_milestone'
  | 'training_reminder'
  | 'system';

interface PushQueueDoc {
  authorityId?: string;
  parkId?: string | null;
  title?: string;
  message?: string;
  sentBy?: string;
  targetAudience?: TargetAudience;
  channel?: PushChannel;
  status?: 'pending' | 'processing' | 'sent' | 'failed';
}

export const sendPushFromQueue = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .firestore.document('push_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const messageId = context.params.messageId as string;
    const data = snap.data() as PushQueueDoc | undefined;
    if (!data) {
      logger.warn(`[sendPushFromQueue] empty payload for ${messageId}`);
      return;
    }

    const channel: PushChannel = data.channel ?? 'encouragement';

    // ── Step 1: claim the message via compare-and-set on status ──────
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        const status = (fresh.data() as PushQueueDoc | undefined)?.status;
        if (status && status !== 'pending') {
          throw new Error(`already_${status}`);
        }
        tx.update(snap.ref, {
          status: 'processing',
          processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.startsWith('already_')) {
        logger.info(
          `[sendPushFromQueue] ${messageId} already ${e.message.slice(8)}, skipping`,
        );
        return;
      }
      logger.error(`[sendPushFromQueue] claim failed for ${messageId}`, e);
      return;
    }

    // ── Step 2: validate inputs ──────────────────────────────────────
    const title = (data.title ?? '').toString().trim();
    const body = (data.message ?? '').toString().trim();
    const authorityId = (data.authorityId ?? '').toString().trim();
    const audience: TargetAudience = data.targetAudience ?? 'all';

    if (!title || !body) {
      await markFailed(snap.ref, 'missing title or body');
      return;
    }
    if (!authorityId) {
      await markFailed(snap.ref, 'missing authorityId — refusing to broadcast');
      return;
    }

    // ── Step 3: resolve audience → user uids ─────────────────────────
    let candidateUids: Set<string>;
    try {
      candidateUids = await resolveAudience(audience, authorityId, data.parkId);
    } catch (e: any) {
      logger.error(`[sendPushFromQueue] audience resolution failed`, e);
      await markFailed(snap.ref, `audience resolution failed: ${e?.message ?? e}`);
      return;
    }

    if (candidateUids.size === 0) {
      logger.info(`[sendPushFromQueue] ${messageId} matched 0 users`);
      await snap.ref.update({
        status: 'sent',
        deliveredCount: 0,
        failedCount: 0,
        tokensRemoved: 0,
        recipientCount: 0,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // ── Step 4: collect tokens, applying per-user pref filter ────────
    const { tokens, tokenOwners } = await collectTokens(candidateUids, channel);

    if (tokens.length === 0) {
      logger.info(`[sendPushFromQueue] ${messageId} matched 0 tokens`);
      await snap.ref.update({
        status: 'sent',
        deliveredCount: 0,
        failedCount: 0,
        tokensRemoved: 0,
        recipientCount: candidateUids.size,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // ── Step 5: multicast in batches ─────────────────────────────────
    const messageBase: admin.messaging.MulticastMessage = {
      tokens: [],
      notification: { title, body },
      data: {
        messageId,
        authorityId,
        channel,
        ...(data.parkId ? { parkId: String(data.parkId) } : {}),
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
          // Re-enable user-tap routing in the future via deep links
          // (data.deepLink → handled by the client's
          //  notificationActionPerformed listener).
          sound: 'default',
        },
      },
    };

    let deliveredCount = 0;
    let failedCount = 0;
    const tokensToRemove: string[] = [];

    for (let i = 0; i < tokens.length; i += MULTICAST_BATCH_SIZE) {
      const batch = tokens.slice(i, i + MULTICAST_BATCH_SIZE);
      try {
        const response = await messaging.sendEachForMulticast({
          ...messageBase,
          tokens: batch,
        });
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
      } catch (e: any) {
        // Catastrophic batch failure (network, throttling). Treat as
        // a wholesale fail for this batch — do NOT remove tokens since
        // they may still be valid.
        failedCount += batch.length;
        logger.warn(`[sendPushFromQueue] batch send failed`, e);
      }
    }

    // ── Step 6: prune dead tokens from each owner's user doc ─────────
    if (tokensToRemove.length > 0) {
      await pruneTokens(tokensToRemove, tokenOwners);
    }

    await snap.ref.update({
      status: 'sent',
      deliveredCount,
      failedCount,
      tokensRemoved: tokensToRemove.length,
      recipientCount: candidateUids.size,
      tokenCount: tokens.length,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `[sendPushFromQueue] ${messageId} done: delivered=${deliveredCount} ` +
        `failed=${failedCount} pruned=${tokensToRemove.length}`,
    );
  });

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function markFailed(
  ref: admin.firestore.DocumentReference,
  error: string,
): Promise<void> {
  try {
    await ref.update({
      status: 'failed',
      error,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error('[sendPushFromQueue] markFailed itself failed', e);
  }
}

/**
 * Resolve the requested audience into a Set of user UIDs scoped to the
 * authority. The implementation deliberately uses small, indexed
 * queries so that a city with millions of users does not require a
 * full collection scan.
 */
async function resolveAudience(
  audience: TargetAudience,
  authorityId: string,
  parkId?: string | null,
): Promise<Set<string>> {
  // Base query — every user mapped to this authority. The project
  // already stores authorityId on `users/{uid}.core.authorityId`, so
  // we filter on that path.
  const baseQuery = db
    .collection('users')
    .where('core.authorityId', '==', authorityId);

  if (audience === 'all') {
    const snap = await baseQuery.select().get();
    return new Set(snap.docs.map((d) => d.id));
  }

  if (audience === 'active_users' || audience === 'inactive_users') {
    // We can't combine equality + range on different fields without a
    // composite index, so we fan out client-side after the authority
    // filter. The active/inactive cohort is small relative to total
    // users (typically < 30%) so this is acceptable for Sprint 3.
    const snap = await baseQuery.get();
    const cutoffActive = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const cutoffInactive = Date.now() - INACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const out = new Set<string>();
    snap.docs.forEach((d) => {
      const lastActive = (d.data() as any)?.lastActive;
      const ts = toMillis(lastActive);
      if (audience === 'active_users') {
        if (ts !== null && ts >= cutoffActive) out.add(d.id);
      } else {
        // inactive_users — never active OR last active before cutoff
        if (ts === null || ts < cutoffInactive) out.add(d.id);
      }
    });
    return out;
  }

  // park_users — anyone who completed a workout at the given park in
  // the last 30 days. Falls back to "all users in authority" if the
  // caller forgot to supply a parkId, with a logged warning.
  if (audience === 'park_users') {
    if (!parkId) {
      logger.warn(
        '[sendPushFromQueue] park_users without parkId, falling back to all',
      );
      const snap = await baseQuery.select().get();
      return new Set(snap.docs.map((d) => d.id));
    }
    const cutoffMs = Date.now() - PARK_VISIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);
    const workouts = await db
      .collection('workouts')
      .where('parkId', '==', parkId)
      .where('date', '>=', cutoffDate)
      .select('userId')
      .get();

    // Cross-reference visiting users with the authority filter to
    // honour tenant boundaries (a Tel-Aviv resident visiting a Haifa
    // park should not get Haifa's mayor messages).
    const visitedUids = new Set<string>();
    workouts.docs.forEach((d) => {
      const uid = (d.data() as any)?.userId;
      if (typeof uid === 'string') visitedUids.add(uid);
    });
    if (visitedUids.size === 0) return visitedUids;

    const authoritySnap = await baseQuery.select().get();
    const inAuthority = new Set(authoritySnap.docs.map((d) => d.id));
    return new Set([...visitedUids].filter((uid) => inAuthority.has(uid)));
  }

  return new Set();
}

/**
 * Convert a Firestore Timestamp / number / Date into millis-since-epoch.
 * Returns null when the value is missing or unrecognised.
 */
function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

/**
 * For each candidate uid, read the user doc and (when prefs allow)
 * harvest its FCM tokens. Returns the deduped token list plus a map
 * of token → owner uid (used by the post-send pruner).
 *
 * The function deliberately uses individual `getAll`-style fetches in
 * batches of 100 to keep latency bounded even for very large
 * audiences. A future optimisation could push the pref check into a
 * Firestore composite index ("settings.pushEnabled" + "core.authorityId").
 */
async function collectTokens(
  uids: Set<string>,
  channel: PushChannel,
): Promise<{ tokens: string[]; tokenOwners: Map<string, string> }> {
  const tokenOwners = new Map<string, string>();
  const tokenSet = new Set<string>();
  const uidArr = Array.from(uids);

  for (let i = 0; i < uidArr.length; i += 100) {
    const slice = uidArr.slice(i, i + 100);
    const refs = slice.map((uid) => db.collection('users').doc(uid));
    const docs = await db.getAll(...refs);
    docs.forEach((d) => {
      if (!d.exists) return;
      const data = d.data() as any;
      const settings = data?.settings ?? {};
      // Master switch — false means user opted out of ALL pushes.
      if (settings.pushEnabled === false) return;

      // Per-channel switch — `system` is always-on (security messages
      // must never be silently dropped). Missing fields default to
      // enabled so we don't surprise legacy users.
      if (channel !== 'system') {
        const channelEnabled = settings.notificationPrefs?.[channel];
        if (channelEnabled === false) return;
      }

      const tokens: unknown = data?.fcmTokens;
      if (!Array.isArray(tokens)) return;
      tokens.forEach((t) => {
        if (typeof t !== 'string' || t.length === 0) return;
        if (!tokenSet.has(t)) {
          tokenSet.add(t);
          tokenOwners.set(t, d.id);
        }
      });
    });
  }

  return { tokens: Array.from(tokenSet), tokenOwners };
}

/**
 * Drop dead FCM tokens from their owners' user docs. Batched into
 * groups of 400 (Firestore's per-batch write cap is 500; we leave
 * headroom for the metadata `null` writes).
 */
async function pruneTokens(
  tokens: string[],
  owners: Map<string, string>,
): Promise<void> {
  // Group tokens by owner uid so we can do one update per user.
  const byOwner = new Map<string, string[]>();
  tokens.forEach((t) => {
    const uid = owners.get(t);
    if (!uid) return;
    if (!byOwner.has(uid)) byOwner.set(uid, []);
    byOwner.get(uid)!.push(t);
  });

  const writers = Array.from(byOwner.entries());
  for (let i = 0; i < writers.length; i += 400) {
    const slice = writers.slice(i, i + 400);
    const batch = db.batch();
    slice.forEach(([uid, deadTokens]) => {
      const ref = db.collection('users').doc(uid);
      const update: Record<string, unknown> = {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Null out the metadata sub-fields too so the doc doesn't bloat
      // forever with stale `lastSeenAt` entries.
      deadTokens.forEach((t) => {
        update[`fcmTokenMeta.${t}`] = admin.firestore.FieldValue.delete();
      });
      batch.update(ref, update);
    });
    try {
      await batch.commit();
    } catch (e) {
      // A failure here is non-fatal — the next send will simply try
      // again and prune. We log so it's visible in operations review.
      logger.warn('[sendPushFromQueue] token prune batch failed', e);
    }
  }
}
