/**
 * Cloud Function: onMilitaryDeclarationWritten
 *
 * Phase 6a (docs/research/military-persona-unified-architecture.md §11) —
 * auto-join/auto-leave for the single, fixed reservist league
 * (community_groups/military_reserve_general, see
 * scripts/seed-military-reserve-league.ts) driven purely by
 * military_declarations/{uid}.status, self-declared and unverified by
 * design (no access codes — David, 04.09.2026 product decision).
 *
 * Triggers on create/update/delete of military_declarations/{uid} — a
 * single onDocumentWritten handler covers all three via before/after
 * diffing, including the delete case (removePersona() deletes this doc
 * entirely, so after.exists === false naturally resolves isReserve to
 * false, no special-cased branch needed).
 *
 *   !wasReserve && isReserve  → join
 *   wasReserve && !isReserve  → leave (covers status change AND deletion)
 *   wasReserve && isReserve   → no-op (e.g. orgId changed) — Phase 6a has
 *                                no unit-scoped group yet; this is the
 *                                extension point for Phase 6b's unit
 *                                join/leave when that's built.
 *
 * Runs entirely via Admin SDK (bypasses firestore.rules) — the client
 * never needs read access to military_declarations for this, and the
 * sensitive members/{uid} create rule (invite-code/isPublic/createdBy
 * only) is never touched.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const RESERVE_LEAGUE_GROUP_ID = 'military_reserve_general';

async function joinReserveLeague(uid: string): Promise<void> {
  const batch = db.batch();
  batch.set(
    db.doc(`community_groups/${RESERVE_LEAGUE_GROUP_ID}/members/${uid}`),
    { uid, role: 'member', joinedAt: admin.firestore.FieldValue.serverTimestamp() },
  );
  batch.set(
    db.doc(`user_memberships/${uid}`),
    { groupIds: admin.firestore.FieldValue.arrayUnion(RESERVE_LEAGUE_GROUP_ID) },
    { merge: true },
  );
  batch.set(
    db.doc(`users/${uid}`),
    { social: { groupIds: admin.firestore.FieldValue.arrayUnion(RESERVE_LEAGUE_GROUP_ID) } },
    { merge: true },
  );
  await batch.commit();
  logger.info(`[militaryReserveLeague] ${uid} joined ${RESERVE_LEAGUE_GROUP_ID}`);
}

async function leaveReserveLeague(uid: string): Promise<void> {
  const batch = db.batch();
  batch.delete(db.doc(`community_groups/${RESERVE_LEAGUE_GROUP_ID}/members/${uid}`));
  batch.set(
    db.doc(`user_memberships/${uid}`),
    { groupIds: admin.firestore.FieldValue.arrayRemove(RESERVE_LEAGUE_GROUP_ID) },
    { merge: true },
  );
  batch.set(
    db.doc(`users/${uid}`),
    { social: { groupIds: admin.firestore.FieldValue.arrayRemove(RESERVE_LEAGUE_GROUP_ID) } },
    { merge: true },
  );
  await batch.commit();

  // Clean the (non-sensitive, status-only) reserveScope stamp off streaks +
  // the last ~10 days of dailyActivity — matches getStepsLeaderboard's own
  // 7-day rolling window with margin. Not batched with the write above:
  // this is a query-then-update, and a fixed doc count isn't known upfront.
  await db.doc(`streaks/${uid}`).update({ reserveScope: admin.firestore.FieldValue.delete() }).catch(() => {
    // No streak doc yet — fine, nothing to clean.
  });

  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const cutoff = tenDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD
  const recentDailyActivity = await db
    .collection('dailyActivity')
    .where('userId', '==', uid)
    .where('date', '>=', cutoff)
    .get();
  if (!recentDailyActivity.empty) {
    const cleanupBatch = db.batch();
    recentDailyActivity.docs.forEach((doc) => {
      cleanupBatch.update(doc.ref, { reserveScope: admin.firestore.FieldValue.delete() });
    });
    await cleanupBatch.commit();
  }

  logger.info(`[militaryReserveLeague] ${uid} left ${RESERVE_LEAGUE_GROUP_ID}`);
}

export const onMilitaryDeclarationWritten = onDocumentWritten(
  'military_declarations/{uid}',
  async (event) => {
    const { uid } = event.params;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;

    const wasReserve = before?.status === 'reserve';
    const isReserve = after?.status === 'reserve';

    try {
      if (!wasReserve && isReserve) {
        await joinReserveLeague(uid);
      } else if (wasReserve && !isReserve) {
        await leaveReserveLeague(uid);
      }
    } catch (e) {
      logger.error(`[militaryReserveLeague] failed for ${uid}`, e);
    }
  },
);
