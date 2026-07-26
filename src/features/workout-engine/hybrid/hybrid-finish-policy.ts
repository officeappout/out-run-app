/**
 * hybrid-finish-policy — the single-save invariant (Phase 3c).
 *
 * A workout session must persist EXACTLY ONE doc:
 *   • Normal run  → useRunningPlayer.finishWorkout() self-saves (1 doc).
 *   • Hybrid run  → finishWorkout is SUPPRESSED (0 docs); the hybrid layer
 *                   writes the single doc via saveHybridWorkout (1 doc).
 * Never 0, never 2. This predicate is the branch finishWorkout takes, so the
 * unit test locks the invariant to the exact code path.
 *
 * Pure — no React, no Firebase.
 */

/** True when the running player should perform its OWN save in finishWorkout. */
export function runnerShouldSelfSave(hybridMode: boolean): boolean {
  return !hybridMode;
}
