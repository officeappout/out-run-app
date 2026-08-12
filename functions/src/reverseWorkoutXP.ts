/**
 * reverseWorkoutXP — server-side XP claw-back companion to awardWorkoutXP.
 *
 * When a workout record is deleted/discarded, the global XP it previously
 * earned (via the Guardian, `awardWorkoutXP`) must be clawed back so the
 * user's `progression.globalXP` / `globalLevel` stay accurate. This is a
 * NEW, fully additive callable — it does not modify `awardWorkoutXP` or
 * `applyAward`/`sanitizeDelta` in `services/progression.service.ts` in any
 * way. It only reuses the pure, side-effect-free `computeGlobalLevel`
 * helper so the leveling formula is never duplicated.
 *
 * Trust boundary (axioms.md §2 — server ownership of progression fields)
 * ────────────────────────────────────────────────────────────────────
 * The client supplies ONLY `workoutId`. The amount of XP to reverse is
 * NEVER accepted from the client — it is read server-side from the
 * workout document's own `xpEarned` field, which was itself written
 * server-side at award time. Nothing about the reversal amount is trusted
 * from the caller.
 *
 * Scope — XP only
 * ────────────────
 * `progression.coins` and `progression.totalCaloriesBurned` are
 * intentionally NOT touched. Coin/calorie reversal is explicitly out of
 * scope for this function.
 *
 * Floor
 * ─────
 * `newXP = max(0, currentXP - xpEarned)` — global XP is never driven
 * negative.
 *
 * Region
 * ──────
 * Pinned to us-central1 to match awardWorkoutXP / ingestHealthSamples, so
 * callers don't need to specify a region.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { computeGlobalLevel, MAX_XP_PER_CALL } from './services/progression.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface ReverseWorkoutXPPayload {
  workoutId: string;
}

interface ReverseWorkoutXPResult {
  reversed: boolean;
  /** Present only when reversed === false. */
  reason?: 'not_found' | 'nothing_to_reverse' | 'already_reversed';
  /** Present only when reversed === true — the XP amount that was deducted. */
  amountReversed?: number;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export const reverseWorkoutXP = onCall<ReverseWorkoutXPPayload, Promise<ReverseWorkoutXPResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    // Mirrors awardWorkoutXP / ingestHealthSamples: every progression-
    // mutating callable requires App Check so direct curl/automation can't
    // forge a reversal.
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      logger.warn('[reverseWorkoutXP] Rejected: no auth context');
      throw new HttpsError('unauthenticated', 'Must be signed in to reverse workout rewards.');
    }

    const uid = request.auth.uid;
    const data = request.data || ({} as ReverseWorkoutXPPayload);
    const workoutId = typeof data.workoutId === 'string' ? data.workoutId.trim() : '';

    if (!workoutId) {
      throw new HttpsError('invalid-argument', 'workoutId is required.');
    }

    const workoutRef = db.collection('workouts').doc(workoutId);
    const userRef = db.collection('users').doc(uid);

    // All business-logic reads (ownership, xpEarned, idempotency marker) and
    // the resulting writes happen inside ONE transaction. This closes the
    // idempotency gap: without a transactional read-then-write, two
    // concurrent/retried calls could both read "not yet reversed" before
    // either write landed, and both would deduct XP. Reading the workout
    // doc transactionally (txn.get) instead of via a standalone pre-
    // transaction getDoc means Firestore's transaction machinery detects
    // the conflict and retries/aborts instead of racing.
    const result = await db.runTransaction<ReverseWorkoutXPResult>(async (txn) => {
      // Firestore transactions require all reads before any writes — both
      // gets happen first, in this order.
      const workoutSnap = await txn.get(workoutRef);
      const userSnap = await txn.get(userRef);

      if (!workoutSnap.exists) {
        logger.info(`[reverseWorkoutXP] workout ${workoutId} not found`);
        return { reversed: false, reason: 'not_found' };
      }

      const workout = (workoutSnap.data() ?? {}) as Record<string, unknown>;

      // Ownership field on `workouts` docs is `userId` (see firestore.rules
      // → match /workouts/{docId}: "request.auth.uid == resource.data.userId";
      // and WorkoutHistoryEntry.userId in
      // src/features/workout-engine/core/services/storage.service.ts).
      if (workout.userId !== uid) {
        logger.warn(
          `[reverseWorkoutXP] Rejected: ${uid} does not own workout ${workoutId}`,
        );
        throw new HttpsError('permission-denied', 'You do not own this workout.');
      }

      // Idempotency guard — once a workout has been reversed, a repeat call
      // (retry-after-failure, double-tap, etc.) is a no-op instead of a
      // second deduction.
      if (workout.xpReversed === true) {
        logger.info(`[reverseWorkoutXP] workout ${workoutId} already reversed — no-op`);
        return { reversed: false, reason: 'already_reversed' };
      }

      const rawXp = workout.xpEarned;
      const rawXpEarned = isPositiveFiniteNumber(rawXp) ? rawXp : 0;
      // Clamp to MAX_XP_PER_CALL — same bound applyAward enforces on award
      // amounts (progression.service.ts) — so a self-hand-crafted, inflated
      // `xpEarned` field on the caller's own workout doc can't grief their
      // own progression beyond the normal per-award ceiling.
      const xpEarned = Math.min(rawXpEarned, MAX_XP_PER_CALL);

      if (xpEarned <= 0) {
        logger.info(`[reverseWorkoutXP] workout ${workoutId} has nothing to reverse`);
        return { reversed: false, reason: 'nothing_to_reverse' };
      }

      const progression = (userSnap.exists ? userSnap.data()?.progression : undefined) as
        | { globalXP?: number }
        | undefined;
      const rawCurrentXP = Number(progression?.globalXP ?? 0);
      // Defense in depth — a hypothetically-corrupted non-numeric
      // progression.globalXP must never produce a NaN write.
      const currentXP = Number.isFinite(rawCurrentXP) ? rawCurrentXP : 0;
      const newXP = Math.max(0, currentXP - xpEarned);
      const newLevel = computeGlobalLevel(newXP);

      // Real nested object (NOT flat 'progression.globalXP' dot-notation
      // keys) — set({merge: true}) writes dot-notation string keys as
      // literal top-level field names containing a dot character; it does
      // NOT expand them into nested paths the way update() does. A nested
      // object is required for merge:true to land inside the `progression`
      // map. set(merge) rather than update() is still intentional so this
      // never throws if the user doc happens to be missing (defense-in-
      // depth — should not happen for an authenticated owner of an existing
      // workout, but axioms.md field-guard discipline applies to doc
      // existence too).
      const updates = {
        progression: {
          globalXP: newXP,
          globalLevel: newLevel,
          lastAwardSource: 'workout:delete-reversal',
          lastAwardAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      txn.set(userRef, updates, { merge: true });

      // Idempotency marker — committed atomically with the progression
      // write above, so there is no window where XP is reversed but the
      // marker is not set (or vice versa).
      txn.set(
        workoutRef,
        { xpReversed: true, xpReversedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      return { reversed: true, amountReversed: xpEarned };
    });

    if (result.reversed) {
      logger.info(
        `[reverseWorkoutXP] ${uid} -${result.amountReversed}XP reversed for workout ${workoutId}`,
      );
    }

    return result;
  },
);
