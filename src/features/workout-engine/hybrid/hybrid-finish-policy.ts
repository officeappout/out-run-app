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

/**
 * G7.1 follow-up (11.10.2026 — caught before merge): the solo-run save has
 * an explicit minimum-activity guard (safeDuration < 60 && safeDistance <
 * 0.1 → "test taps / accidental starts", skip save entirely) so trivial/
 * empty sessions don't pollute history or activation/retention metrics.
 * finishHybrid/saveHybridWorkout never had an equivalent — harmless before
 * G7.1 (a trivial hybrid tap-test that hit the generic Stop button was
 * discarded entirely by the very bug G7.1 fixed), but G7.1's redirect above
 * now routes every generic Stop tap through this unconditional save path —
 * without this guard, a trivial/empty hybrid session would now ALWAYS be
 * saved, re-introducing the exact pollution the solo-run guard exists to
 * prevent. Also checks totalStrengthSets (the solo guard doesn't need to) —
 * a hybrid session's real activity can be strength-only (a completed
 * station with almost no aerobic distance), and distance/duration alone
 * would wrongly discard that.
 */
export function isNegligibleHybridSession(
  totalDurationSec: number,
  totalActualDistanceKm: number,
  totalStrengthSets: number,
): boolean {
  return totalDurationSec < 60 && totalActualDistanceKm < 0.1 && totalStrengthSets === 0;
}
