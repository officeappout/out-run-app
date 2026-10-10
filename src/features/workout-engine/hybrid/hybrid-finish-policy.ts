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

/**
 * G7.1 fix (Sderot field test, 10.10.2026): the complementary half of the
 * single-save invariant above. 8 generic UI "Stop"/"Finish" buttons call
 * finishWorkout() directly with no idea a hybrid session might be active.
 * Before this, a direct call during an active hybrid session hit
 * runnerShouldSelfSave's suppression branch straight away — 0 docs, no XP,
 * no history, the entire workout silently discarded. True means
 * finishWorkout must redirect to useHybridRun.finishHybrid() (the only
 * path that actually saves a hybrid session) instead of running its own
 * logic. `calledFromHybridTeardown` is the one flag that distinguishes
 * finishHybrid's own internal post-save teardown call into finishWorkout
 * (false → proceed normally, same as always) from every other caller
 * (true → redirect).
 */
export function shouldRedirectToHybridFinish(
  hybridMode: boolean,
  calledFromHybridTeardown: boolean | undefined,
): boolean {
  return hybridMode && !calledFromHybridTeardown;
}
