/**
 * Client-side wrapper for the `awardWorkoutXP` Cloud Function (the Guardian).
 *
 * This is the ONLY supported way to credit XP / coins / calories to a user
 * from the browser. Direct Firestore writes to `progression.coins`,
 * `progression.globalXP`, `progression.globalLevel`, or
 * `progression.totalCaloriesBurned` are blocked by Firestore Security Rules
 * (see `noGameIntegrityFieldsChanged()` in firestore.rules).
 *
 * Failure mode
 * ────────────
 * If the call fails (offline, function cold-start crash, auth missing) this
 * helper returns `null` and logs — the caller MUST keep its optimistic local
 * Zustand state so the UI doesn't snap backwards. The next successful call
 * will reconcile via the onSnapshot listener.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

export interface AwardWorkoutXPInput {
  /** XP to add (clamped server-side to 2 000 per call). */
  xpDelta?: number;
  /** Coins to add (clamped to 5 000). */
  coinsDelta?: number;
  /** Calories to add (clamped to 5 000). */
  caloriesDelta?: number;
  /** Free-text label, e.g. 'workout:strength', 'goal-bonus', 'park-contribution'. */
  source: string;
}

export interface AwardWorkoutXPResult {
  ok: true;
  xpDelta: number;
  coinsDelta: number;
  caloriesDelta: number;
  newGlobalXP: number;
  newGlobalLevel: number;
  leveledUp: boolean;
  noop?: boolean;
}

export async function awardWorkoutXP(
  input: AwardWorkoutXPInput,
): Promise<AwardWorkoutXPResult | null> {
  if (typeof window === 'undefined') return null;
  try {
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable<AwardWorkoutXPInput, AwardWorkoutXPResult>(
      functions,
      'awardWorkoutXP',
    );
    const { data } = await callable(input);
    return data;
  } catch (err) {
    console.error('[awardWorkoutXP] Guardian call failed:', err);
    return null;
  }
}
