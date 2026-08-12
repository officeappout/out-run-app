/**
 * deleteWorkoutWithReversal — shared delete-with-reversal orchestration for a
 * completed workout doc (`workouts/{workoutId}`).
 *
 * Domain-neutral home: this coordinates three domains — workout-engine
 * (storage.service's `deleteWorkout`), activity (useActivityStore's
 * `reverseStreakForToday`), and lib (`reverseWorkoutXP`) — so per CLAUDE.md's
 * own "shared utilities belong in src/lib" rule (Agent Operating Rules #7),
 * it does not live inside any single `src/features/{domain}/` tree.
 *
 * Gated by `WORKOUT_DELETE_EXPANDED_ENABLED` (src/config/feature-flags.ts) at
 * every call site — this file itself has no flag check; callers gate it.
 *
 * CRITICAL ORDERING — do not reorder. Each step depends on the doc still
 * existing (or not yet existing) in a specific way:
 *
 *   1. Call `reverseWorkoutXP(workoutId)` — the Cloud Function reads the doc
 *      SERVER-SIDE to verify ownership and read `xpEarned`. It MUST run
 *      before the doc is deleted: once the doc is gone, the function
 *      harmlessly returns `{ reversed: false, reason: 'not_found' }`, so
 *      calling it after deletion would always no-op and silently drop XP
 *      reversal.
 *   2. Call `deleteWorkout(workoutId)` (storage.service) to actually remove
 *      the doc. This function does its own ownership check + re-fetch
 *      internally — it is the single source of truth for whether the delete
 *      itself succeeded — and it returns the deleted doc's full data
 *      (including its `date` field) on success. We reuse that return value
 *      instead of doing our own separate `getDoc` for the date, avoiding a
 *      redundant read.
 *   3. Determine + apply streak reversal using the `date` field from step 2's
 *      return value. This step queries "workouts remaining today" — it MUST
 *      run AFTER the doc is physically deleted (not before), otherwise two
 *      near-simultaneous same-day deletes could each see the other's
 *      not-yet-removed doc and both wrongly conclude other workouts remain
 *      (TOCTOU race → permanently stuck non-zero streak). This mirrors how
 *      the (retiring) deleteLastWorkout() wrapper in useRunningPlayer.ts
 *      already ran its equivalent query — after deletion, not before.
 */

import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { deleteWorkout } from '@/features/workout-engine/core/services/storage.service';
import { reverseWorkoutXP } from '@/lib/reverseWorkoutXP';
import { useActivityStore, getTodayString, toLocalDayString } from '@/features/activity/store/useActivityStore';

export interface DeleteWorkoutWithReversalResult {
  deleted: boolean;
  xpReversed: boolean;
  streakReversed: boolean;
}

/**
 * Duck-types a Firestore Timestamp (has `.toDate()`) the same way the
 * (retiring) deleteLastWorkout() wrapper does inline — no `Timestamp` import
 * needed on the input side, and it degrades to '' (never matches
 * getTodayString()) for any other shape, which is the safe default for a
 * field-guard.
 *
 * The actual day-string FORMATTING is deliberately NOT reimplemented here —
 * it delegates to `toLocalDayString()`, the single shared local-calendar-day
 * source of truth exported from useActivityStore.ts (also used internally by
 * that file's getTodayString() / getYesterdayString()). This is what makes
 * "today" agree between the two files by construction: useActivityStore.ts
 * sets `lastStreakDate` using LOCAL calendar day, so the date this file
 * derives from a workout doc must use the exact same local-day logic — not
 * `.toISOString().split('T')[0]` (UTC calendar day), which disagrees with
 * local day for a multi-hour window every day in Israel (UTC+2/+3).
 */
function dateFieldToDayString(rawDate: unknown): string {
  const ts = rawDate as { toDate?: () => Date } | undefined;
  return ts?.toDate ? toLocalDayString(ts.toDate()) : '';
}

export async function deleteWorkoutWithReversal(
  workoutId: string,
): Promise<DeleteWorkoutWithReversalResult> {
  // ── Step 1: reverse XP FIRST, while the doc still exists server-side ─────
  // reverseWorkoutXP() already catches its own errors and resolves to `null`
  // (see src/lib/reverseWorkoutXP.ts) rather than throwing, but we wrap it
  // here too per the orchestration contract: a reversal failure must never
  // block the actual deletion in step 2.
  let xpReversed = false;
  try {
    const xpResult = await reverseWorkoutXP(workoutId);
    xpReversed = xpResult?.reversed === true;
  } catch (err) {
    console.error('[deleteWorkoutWithReversal] XP reversal call failed:', err);
  }

  // ── Step 2: actually delete the doc ───────────────────────────────────────
  // deleteWorkout() re-verifies ownership via its own getDoc and performs the
  // real deleteDoc() — this is the single source of truth for `deleted`. Its
  // return value (the deleted doc's own data) also supplies the `date` field
  // step 3 needs, so no separate getDoc for that is required here.
  const deletedEntry = await deleteWorkout(workoutId);
  const deleted = deletedEntry !== null;
  const workoutDateStr = deletedEntry ? dateFieldToDayString(deletedEntry.date) : '';

  // ── Step 3: streak reversal — conditional, best-effort, runs AFTER delete ─
  // Condition: the deleted workout's OWN date must be today, AND after this
  // deletion there must be zero remaining workouts logged today for this user.
  //
  // If the workout being deleted is NOT dated today, streak reversal is
  // deliberately SKIPPED ENTIRELY (not attempted, not approximated) — streak
  // correctness for a delete of a workout that is not today's most-recent is
  // out of scope. There is no general streak-recompute mechanism anywhere in
  // this codebase (confirmed by prior investigation): `currentStreak` /
  // `longestStreak` / `lastStreakDate` are only ever advanced forward by
  // logWorkout/logMultiCategoryWorkout, and reverseStreakForToday() only
  // knows how to undo a single "today" increment. Attempting to "fix" an
  // older day's streak state here would require re-deriving the entire
  // streak history from scratch — a wrong correction is worse than no
  // correction, so this deliberately stays a no-op for that case.
  let streakReversed = false;
  const todayStr = getTodayString();

  if (deleted && workoutDateStr === todayStr) {
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        // Same query construction + client-side date-string filtering as the
        // (retiring) deleteLastWorkout() wrapper in
        // src/features/workout-engine/players/running/store/useRunningPlayer.ts
        // (collection('workouts') + where('userId','==',uid), then filter by
        // the doc's own `date` field converted to a 'YYYY-MM-DD' string) —
        // this now runs AFTER the physical delete (step 2), exactly like
        // that wrapper does, so it is TOCTOU-free: the deleted doc is
        // already gone server-side by the time this query runs, no manual
        // exclusion of `workoutId` is needed.
        //
        // Bounded with a `where('date', '>=', ...)` constraint (start of
        // today, same local-day convention) instead of pulling the user's
        // entire workout history and filtering client-side — a cheap,
        // non-blocking read-size optimization.
        const now = new Date();
        const startOfTodayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const startOfTodayTimestamp = Timestamp.fromDate(startOfTodayLocal);

        const q = query(
          collection(db, 'workouts'),
          where('userId', '==', uid),
          where('date', '>=', startOfTodayTimestamp),
        );
        const snap = await getDocs(q);
        const remainingToday = snap.docs.filter(
          (d) => dateFieldToDayString(d.data().date) === todayStr,
        ).length;

        if (remainingToday === 0) {
          const streakResult = await useActivityStore.getState().reverseStreakForToday();
          streakReversed = streakResult.reversed === true;
        }
      }
    } catch (err) {
      console.error('[deleteWorkoutWithReversal] Streak reversal failed:', err);
    }
  }

  return { deleted, xpReversed, streakReversed };
}
