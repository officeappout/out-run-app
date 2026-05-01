/**
 * Account deletion — GDPR Art. 17 / Israeli Privacy Law right-to-erasure.
 *
 * Two entry points, both call the same idempotent `purgeUserData(uid)`:
 *
 *   1. `requestAccountDeletion` (callable, v2)
 *      User-initiated from the in-app "מחיקת חשבון" flow. Verifies auth,
 *      purges every server-side artefact for the caller, writes a final
 *      audit-log row, then calls `auth.deleteUser` to revoke credentials.
 *      The Auth deletion fires the v1 trigger below — purgeUserData is
 *      idempotent so the second pass is a no-op.
 *
 *   2. `onUserDelete` (Auth onDelete trigger, v1)
 *      Safety net for admin-initiated deletes (Firebase console, Admin SDK,
 *      bulk scripts). Ensures no orphan data is left behind even if the
 *      callable wasn't used.
 *
 * What is preserved (intentionally):
 *   • `audit_logs` — required for compliance audit trail. GDPR Art. 17(3)(b)
 *     allows retention of personal data when needed to comply with legal
 *     obligations. The 24-month retention is enforced by `cleanupOldLogs`.
 *   • Messages the user SENT in other people's inboxes / shared chats are
 *     anonymised at the chat level (we remove the uid from `participants`
 *     and delete the DM entirely). Group-chat history is preserved for the
 *     remaining members; the leaving user's display name in `messages`
 *     remains for context but their account no longer exists.
 *   • Reactions/kudos given to others — these are part of the recipient's
 *     record and their continued display does not identify the author once
 *     the author's `users/{uid}` doc is gone.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as functionsV1 from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

const BATCH_SIZE = 400;

/**
 * Delete every doc returned by `query`, page by page. Returns total deleted.
 */
async function deleteQueryBatch(query: admin.firestore.Query): Promise<number> {
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await query.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }
  return total;
}

/**
 * Delete every Cloud Storage object whose path starts with `prefix`.
 * Errors on individual files are swallowed — best-effort cleanup.
 */
async function deleteStoragePrefix(prefix: string): Promise<number> {
  try {
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return 0;
    await Promise.all(files.map((f) => f.delete().catch(() => null)));
    return files.length;
  } catch (e) {
    logger.warn(`[purgeUserData] storage prefix delete failed for ${prefix}`, e);
    return 0;
  }
}

/**
 * Idempotent — safe to run multiple times for the same uid.
 * Returns per-collection deletion counts for audit logging.
 */
async function purgeUserData(uid: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // 1. users/{uid} + every subcollection (workouts history, progression
  //    snapshots, etc.). recursiveDelete is provided by Admin SDK v10+.
  try {
    await db.recursiveDelete(db.collection('users').doc(uid));
    counts.users = 1;
  } catch (e) {
    logger.warn(`[purgeUserData] users/${uid} recursiveDelete failed`, e);
    counts.users = 0;
  }

  // 2. dailyActivity docs use composite ID `${uid}_${YYYY-MM-DD}`.
  //    Range-by-document-id query: '~' (ASCII 126) is higher than any
  //    char Firestore allows in a docID, so this captures all of them.
  try {
    counts.dailyActivity = await deleteQueryBatch(
      db.collection('dailyActivity')
        .where(admin.firestore.FieldPath.documentId(), '>=', `${uid}_`)
        .where(admin.firestore.FieldPath.documentId(), '<', `${uid}_~`),
    );
  } catch (e) {
    logger.warn(`[purgeUserData] dailyActivity purge failed for ${uid}`, e);
    counts.dailyActivity = 0;
  }

  // 3. Presence, social graph, personal activity feed, kudos inbox.
  //    Each is owned exclusively by the deleted user.
  for (const top of ['presence', 'connections', 'activity', 'kudos'] as const) {
    try {
      await db.recursiveDelete(db.collection(top).doc(uid));
      counts[top] = 1;
    } catch (e) {
      logger.warn(`[purgeUserData] ${top}/${uid} delete failed`, e);
      counts[top] = 0;
    }
  }

  // 4. feed_posts authored by the user — full removal (Phase 3.2 rule
  //    also lets the user delete these themselves, but we sweep on account
  //    deletion to make sure nothing is left behind).
  try {
    counts.feedPosts = await deleteQueryBatch(
      db.collection('feed_posts').where('authorUid', '==', uid),
    );
  } catch (e) {
    logger.warn(`[purgeUserData] feed_posts purge failed for ${uid}`, e);
    counts.feedPosts = 0;
  }

  // 5. Chats. Two cases:
  //    • DMs (type == 'dm'): delete the entire thread + messages
  //    • Groups (type == 'group'): remove uid from participants array
  let chatsTouched = 0;
  try {
    // array-contains is limited to one value, so a single query is fine.
    const chats = await db
      .collection('chats')
      .where('participants', 'array-contains', uid)
      .get();
    for (const chatDoc of chats.docs) {
      const data = chatDoc.data();
      if (data.type === 'dm') {
        await db.recursiveDelete(chatDoc.ref);
      } else {
        await chatDoc.ref.update({
          participants: admin.firestore.FieldValue.arrayRemove(uid),
        });
      }
      chatsTouched++;
    }
  } catch (e) {
    logger.warn(`[purgeUserData] chats purge failed for ${uid}`, e);
  }
  counts.chats = chatsTouched;

  // 6. community_groups created by the user — delete the group + members
  //    subcollection. Members of those groups will lose access on next read.
  try {
    const owned = await db
      .collection('community_groups')
      .where('createdBy', '==', uid)
      .get();
    let g = 0;
    for (const grp of owned.docs) {
      await db.recursiveDelete(grp.ref);
      g++;
    }
    counts.ownedGroups = g;
  } catch (e) {
    logger.warn(`[purgeUserData] community_groups purge failed for ${uid}`, e);
    counts.ownedGroups = 0;
  }

  // 7. Cloud Storage — anything namespaced under the user's uid.
  //    Common prefixes: users/{uid}/health-declaration-*.pdf, avatars/{uid}/...
  counts.storageFiles =
    (await deleteStoragePrefix(`users/${uid}/`)) +
    (await deleteStoragePrefix(`avatars/${uid}/`)) +
    (await deleteStoragePrefix(`profile-photos/${uid}/`));

  return counts;
}

/**
 * Write a "user deleted" row to audit_logs. Best-effort — failures here
 * must NOT prevent the deletion itself from completing.
 */
async function writeDeletionAuditLog(
  uid: string,
  source: 'callable' | 'auth-trigger',
  counts: Record<string, number>,
  sourceIp: string = 'unknown',
): Promise<void> {
  try {
    await db.collection('audit_logs').add({
      adminId: 'system',
      adminName: source === 'callable' ? 'requestAccountDeletion' : 'onUserDelete-trigger',
      actionType: 'DELETE',
      targetEntity: 'User',
      targetId: uid,
      details:
        source === 'callable'
          ? 'User-initiated GDPR / Israeli Privacy Law account deletion'
          : 'Auth deletion → automatic data purge',
      oldValue: null,
      newValue: JSON.stringify(counts).slice(0, 10_000),
      sourceIp,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn(`[writeDeletionAuditLog] failed for ${uid}`, e);
  }
}

/**
 * Best-effort source-IP from the v2 callable's rawRequest, mirroring
 * functions/src/auditLogger.ts so audit rows are consistent.
 */
function extractSourceIp(rawRequest: any): string {
  try {
    const xff = rawRequest?.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim().slice(0, 64);
    }
    if (Array.isArray(xff) && xff[0]) {
      return String(xff[0]).split(',')[0].trim().slice(0, 64);
    }
    const sockIp = rawRequest?.ip || rawRequest?.socket?.remoteAddress;
    if (typeof sockIp === 'string' && sockIp.length > 0) {
      return sockIp.slice(0, 64);
    }
  } catch {
    /* fall through */
  }
  return 'unknown';
}

interface DeletionResult {
  ok: true;
  counts: Record<string, number>;
}

export const requestAccountDeletion = onCall<unknown, Promise<DeletionResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 540, // recursiveDelete on a power user can take a while
    memory: '512MiB',
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required to delete account.');
    }

    const uid = request.auth.uid;
    const sourceIp = extractSourceIp(request.rawRequest);
    logger.info(`[requestAccountDeletion] start uid=${uid} ip=${sourceIp}`);

    let counts: Record<string, number> = {};
    try {
      counts = await purgeUserData(uid);
    } catch (e: any) {
      logger.error(`[requestAccountDeletion] purge failed for ${uid}`, e);
      throw new HttpsError('internal', 'Account data purge failed; please retry.');
    }

    await writeDeletionAuditLog(uid, 'callable', counts, sourceIp);

    // Final step: revoke the Auth identity. After this returns the user
    // can no longer obtain a fresh ID token. The v1 onDelete trigger below
    // will then fire and re-run purgeUserData (idempotent, no-op).
    try {
      await auth.deleteUser(uid);
    } catch (e: any) {
      // Swallow "user-not-found" — somebody beat us to the deletion.
      if (e?.code !== 'auth/user-not-found') {
        logger.error(`[requestAccountDeletion] auth.deleteUser failed for ${uid}`, e);
        throw new HttpsError('internal', 'Failed to revoke authentication record.');
      }
    }

    logger.info(`[requestAccountDeletion] complete uid=${uid}`, counts);
    return { ok: true, counts };
  },
);

/**
 * Auth onDelete trigger — only path that runs in v1. Required because
 * firebase-functions v2 does not yet expose a non-blocking "after user
 * deleted" trigger; the v1 SDK is bundled and fully supported alongside.
 */
export const onUserDelete = functionsV1.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  logger.info(`[onUserDelete] auth deletion detected uid=${uid}`);
  try {
    const counts = await purgeUserData(uid);
    await writeDeletionAuditLog(uid, 'auth-trigger', counts);
    logger.info(`[onUserDelete] purge complete uid=${uid}`, counts);
  } catch (e) {
    logger.error(`[onUserDelete] purge failed for uid=${uid}`, e);
  }
});
