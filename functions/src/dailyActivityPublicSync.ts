/**
 * Cloud Function: dailyActivityPublicSync — SPEC-03 Wave A (SEC-02)
 *
 * `dailyActivity/{uid}_{date}` holds real health data — steps, calories,
 * active minutes, distance, passive sensor fields — and used to be readable
 * by any authenticated user (including anonymous guests) because the steps
 * leaderboard (getStepsLeaderboard, ranking.service.ts) queried it directly,
 * cross-user, with no field-level narrowing possible in a Firestore rule
 * (a rule can restrict WHICH docs are readable, not WHICH FIELDS within a
 * readable doc). The fix is the same pattern already used for `inviteCode`
 * (SPEC-01) and `healthDeclarationPdfUrl` (SPEC-02): move the narrow public
 * subset the feature actually needs to its own collection, and lock the
 * original down to owner-only.
 *
 * This collection mirrors ONLY `{uid, displayName, steps, authorityId,
 * date}` — nothing else. `dailyActivity` itself is now owner + admin only
 * (see firestore.rules).
 *
 * Why scheduled, not a write-triggered mirror
 * ────────────────────────────────────────────
 * A passive step-count sync writes to a user's `dailyActivity` doc many
 * times per day (see ingestHealthSamples.ts). An onDocumentWritten trigger
 * mirroring on every single one of those writes would roughly DOUBLE
 * dailyActivity's write volume for zero user-visible benefit — the
 * leaderboard is a "check in when you feel like it" screen, not a
 * real-time one. Scheduled instead, same shape as this file's own sibling
 * unitLeagueRollup.ts (hourly, same collection, same WINDOW_DAYS=7 metric
 * definition).
 *
 * Why "today only", not the full 7-day window, on every run
 * ────────────────────────────────────────────────────────────
 * getStepsLeaderboard's 7-day window is a READ-time aggregation over 7
 * already-independent per-day docs. Once a day is in the past, its
 * dailyActivity doc for that date is not written to again — so re-syncing
 * it on every scheduled run would burn a write on a doc whose content
 * never changed, every single cycle, for no reason. Only "today"'s doc is
 * still actively changing, so only it needs re-syncing. Historical days
 * stay correct forever once synced once.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const MAX_BATCH = 450; // mirrors leaderboard.ts's rollupLeaderboard batching convention

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches dailyActivity's docId date segment
}

export const dailyActivityPublicSync = onSchedule(
  { schedule: '0 */2 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const today = todayDateString();

    const snap = await db
      .collection('dailyActivity')
      .where('date', '==', today)
      .get();

    if (snap.empty) {
      logger.info(`[dailyActivityPublicSync] no dailyActivity docs for ${today}, nothing to sync`);
      return;
    }

    let batch = db.batch();
    let batchCount = 0;
    let written = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const uid = data.userId as string | undefined;
      const authorityId = data.authorityId as string | undefined;
      // Docs without authorityId yet (see ranking.service.ts's own comment:
      // stamped on first workout sync after the scope-stamp was added)
      // can't be scoped by any leaderboard query — skip, matches the raw
      // collection's existing invisible-until-stamped behavior exactly.
      if (!uid || !authorityId) continue;

      const steps = typeof data.steps === 'number' ? data.steps : 0;
      const displayName = typeof data.displayName === 'string' ? data.displayName : '???';

      batch.set(db.doc(`dailyActivityPublic/${uid}_${today}`), {
        uid,
        displayName,
        steps,
        authorityId,
        date: today,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      written++;
      batchCount++;

      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(`[dailyActivityPublicSync] synced ${written}/${snap.size} dailyActivity doc(s) for ${today}`);
  },
);
