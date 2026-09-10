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
 * This collection mirrors `{uid, displayName, steps, authorityId, date,
 * ageGroup}` — nothing else. `dailyActivity` itself is now owner + admin
 * only (see firestore.rules).
 *
 * ageGroup (SPEC-04 Wave B, 10.09.2026)
 * ───────────────────────────────────────
 * getStepsLeaderboard (ranking.service.ts) queried this collection with no
 * age boundary at all — a minor's real display name + step count was
 * visible to any authenticated reader, the same underlying gap Wave A
 * closed for presence and Wave B/D closed for userPublic search. Read from
 * userAge/{uid} (never client-suppliable — same helper the rules use),
 * batched the same way resolveRealAccountUids batches its Admin Auth
 * lookup below. Fails to 'minor' on a missing doc or a lookup error —
 * matches getUserAgeGroup()'s own fail-safe default, so an unresolved uid
 * is never accidentally exposed to adults.
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
 *
 * Anonymous guests never appear here (SPEC-03 Wave C)
 * ─────────────────────────────────────────────────────
 * David's 09.09 policy decision: a guest can train and have it logged for
 * themselves, but must never become visible to anyone else without a real
 * account — "appearing in the leaderboard" is explicitly named as the one
 * line that matters most in that decision. Training itself still writes
 * dailyActivity regardless of account type (unaffected — that stays
 * self-only, always has been), so the exclusion has to happen HERE, at
 * the one place data crosses from private to public. Checked via a batched
 * Admin Auth lookup (getUsers, up to 100 uids/call) — an anonymous account
 * has zero entries in providerData; anything else (Google/Apple/email/
 * phone) is real. Fails closed: a lookup error or a not-found uid is
 * treated as "not confirmed real" and excluded from this sync, not
 * silently mirrored.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const MAX_BATCH = 450; // mirrors leaderboard.ts's rollupLeaderboard batching convention
const AUTH_LOOKUP_CHUNK = 100; // Admin SDK's getUsers() cap per call

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches dailyActivity's docId date segment
}

/**
 * Resolves which of the given uids belong to a real (non-anonymous)
 * account. Fails closed: any uid whose lookup errors, or that Auth
 * reports as not found, is simply absent from the returned set — callers
 * must treat "not in the set" as "do not expose", not as "assume real".
 */
async function resolveRealAccountUids(uids: string[]): Promise<Set<string>> {
  const real = new Set<string>();
  for (let i = 0; i < uids.length; i += AUTH_LOOKUP_CHUNK) {
    const chunk = uids.slice(i, i + AUTH_LOOKUP_CHUNK);
    try {
      const result = await getAuth().getUsers(chunk.map((uid) => ({ uid })));
      for (const user of result.users) {
        if (user.providerData.length > 0) real.add(user.uid);
      }
    } catch (err) {
      logger.warn(
        `[dailyActivityPublicSync] Admin Auth lookup failed for a chunk of ${chunk.length} uid(s) — excluding them from this sync (fail-closed: a real account must be confirmed before appearing in the leaderboard):`,
        err,
      );
    }
  }
  return real;
}

/**
 * Resolves ageGroup for each uid from userAge/{uid} — the same tiny
 * rules-only doc the Firestore rules themselves read via getUserAgeGroup().
 * Batched via getAll() (Admin SDK's multi-doc-ref read), 300 refs/call
 * being comfortably under Firestore's per-request document-reference cap.
 * A missing doc or a failed chunk defaults every uid in it to 'minor' —
 * fail-closed, matching getUserAgeGroup()'s own rule-side default.
 */
async function resolveAgeGroups(uids: string[]): Promise<Map<string, 'minor' | 'adult'>> {
  const result = new Map<string, 'minor' | 'adult'>();
  const CHUNK = 300;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const chunk = uids.slice(i, i + CHUNK);
    try {
      const refs = chunk.map((uid) => db.doc(`userAge/${uid}`));
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, idx) => {
        const ageGroup = snap.exists ? (snap.data()?.ageGroup as string | undefined) : undefined;
        result.set(chunk[idx], ageGroup === 'adult' ? 'adult' : 'minor');
      });
    } catch (err) {
      logger.warn(
        `[dailyActivityPublicSync] userAge lookup failed for a chunk of ${chunk.length} uid(s) — defaulting to 'minor' (fail-closed):`,
        err,
      );
      chunk.forEach((uid) => result.set(uid, 'minor'));
    }
  }
  return result;
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

    const candidateUids = Array.from(
      new Set(snap.docs.map((doc) => doc.data().userId as string | undefined).filter((v): v is string => !!v)),
    );
    const realUids = await resolveRealAccountUids(candidateUids);
    const ageGroups = await resolveAgeGroups(candidateUids);

    let batch = db.batch();
    let batchCount = 0;
    let written = 0;
    let skippedAnonymous = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const uid = data.userId as string | undefined;
      const authorityId = data.authorityId as string | undefined;
      // Docs without authorityId yet (see ranking.service.ts's own comment:
      // stamped on first workout sync after the scope-stamp was added)
      // can't be scoped by any leaderboard query — skip, matches the raw
      // collection's existing invisible-until-stamped behavior exactly.
      if (!uid || !authorityId) continue;

      if (!realUids.has(uid)) {
        skippedAnonymous++;
        continue;
      }

      const steps = typeof data.steps === 'number' ? data.steps : 0;
      const displayName = typeof data.displayName === 'string' ? data.displayName : '???';

      batch.set(db.doc(`dailyActivityPublic/${uid}_${today}`), {
        uid,
        displayName,
        steps,
        authorityId,
        date: today,
        ageGroup: ageGroups.get(uid) ?? 'minor',
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

    logger.info(`[dailyActivityPublicSync] synced ${written}/${snap.size} dailyActivity doc(s) for ${today} (${skippedAnonymous} skipped — no confirmed real account)`);
  },
);
