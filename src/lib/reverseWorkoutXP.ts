/**
 * Client-side wrapper for the `reverseWorkoutXP` Cloud Function.
 *
 * Companion to `awardWorkoutXP` (see `src/lib/awardWorkoutXP.ts`). Reverses
 * (deducts) the global XP previously awarded for a specific workout — used
 * when a workout record is deleted so its XP contribution is clawed back.
 * The client supplies only `workoutId`; the reversal amount is determined
 * entirely server-side from the workout doc's own `xpEarned` field.
 *
 * Direct Firestore writes to `progression.globalXP` / `progression.globalLevel`
 * are blocked by Firestore Security Rules (see `noGameIntegrityFieldsChanged()`
 * in firestore.rules) — this callable is the only supported way to reverse
 * them from the browser.
 *
 * Failure mode
 * ────────────
 * If the call fails (offline, function cold-start crash, auth missing) this
 * helper returns `null` and logs — same convention as `awardWorkoutXP`.
 * There is no optimistic local state to roll back here; the caller should
 * treat `null` as "reversal did not happen" and may retry later.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

export interface ReverseWorkoutXPInput {
  /** ID of the `workouts/{workoutId}` doc whose XP should be reversed. */
  workoutId: string;
}

export interface ReverseWorkoutXPResult {
  reversed: boolean;
  /** Present only when reversed === false. */
  reason?: 'not_found' | 'nothing_to_reverse' | 'already_reversed';
  /** Present only when reversed === true — the XP amount that was deducted. */
  amountReversed?: number;
}

export async function reverseWorkoutXP(
  workoutId: string,
): Promise<ReverseWorkoutXPResult | null> {
  if (typeof window === 'undefined') return null;
  try {
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<ReverseWorkoutXPInput, ReverseWorkoutXPResult>(
      functions,
      'reverseWorkoutXP',
    );
    const { data } = await callable({ workoutId });
    return data;
  } catch (err) {
    console.error('[reverseWorkoutXP] Reversal call failed:', err);
    return null;
  }
}
