/**
 * session-frame.utils — time-aware warmup/cooldown budgets (pure, unit-tested)
 * (availableTime contract, product decision 10.07.2026).
 *
 * PRODUCT RULE: warmup + cooldown are INCLUDED in the user's time budget
 * (total time = what the user sees), so they must SCALE with the session:
 * a 15-min request gets a ~2-min warmup, not the fixed 6-min ladder. A
 * minimum warmup floor ALWAYS remains (injury prevention) — skipping is
 * never the default. ("Skip warmup" toggle for advanced users = future.)
 */

/** Estimator alignment: 60s work + 5s transition per warmup slot. */
export const WARMUP_SLOT_SECONDS = 65;
/** Injury-prevention floor — the warmup never shrinks below this. */
export const WARMUP_MIN_SLOTS = 2;
/** Historical ceiling (6 min) — long sessions keep today's ladder size. */
export const WARMUP_MAX_BUDGET_SEC = 360;
/** Warmup share of the session (~13%) between the floor and the ceiling. */
export const WARMUP_SESSION_SHARE = 0.13;

/**
 * Max warmup slots for a session length.
 *   10-15min → 2 · 30min → 3 · 45min → 5 · 60min+ → 5 (ceiling)
 * undefined/invalid → legacy ceiling (5) — behavior unchanged for callers
 * that don't pass a time.
 */
export function warmupSlotBudget(availableTimeMin: number | undefined): number {
  if (!availableTimeMin || availableTimeMin <= 0) {
    return Math.floor(WARMUP_MAX_BUDGET_SEC / WARMUP_SLOT_SECONDS);
  }
  const budgetSec = Math.min(
    WARMUP_MAX_BUDGET_SEC,
    Math.max(WARMUP_MIN_SLOTS * WARMUP_SLOT_SECONDS, availableTimeMin * 60 * WARMUP_SESSION_SHARE),
  );
  return Math.max(WARMUP_MIN_SLOTS, Math.floor(budgetSec / WARMUP_SLOT_SECONDS));
}

/**
 * Cooldown stretch count for a session length.
 *   <20min → 1 · 20-39min → 2 · 40min+ → 3 (existing max)
 * undefined → 2 (today's typical output).
 */
export function cooldownCountBudget(availableTimeMin: number | undefined): 1 | 2 | 3 {
  if (!availableTimeMin || availableTimeMin <= 0) return 2;
  if (availableTimeMin < 20) return 1;
  if (availableTimeMin < 40) return 2;
  return 3;
}

/**
 * Minimum MAIN exercises for a session length (owner's target, generator QA round 1,
 * 2026-10-18 — 05-BENCHMARK §6.2 H3):
 *   ≤10 → 3 · ≤15 → 3 · ≤20 → 4 · ≤30 → 4 · ≤45 → 5 · >45 → 6
 * A floor on VARIETY, not volume: the budget/duration passes reach it by trimming
 * sets (never below the structure floor) and then rest before they may drop a whole
 * exercise below it (BudgetDistributor._pyramidAwareCap / cluster caps,
 * PresentationFormatter.enforceVolumeCap). undefined/invalid → 0 (no floor —
 * legacy behaviour for callers that don't pass a time).
 */
export function minMainExercisesFor(availableTimeMin: number | undefined): number {
  if (!availableTimeMin || availableTimeMin <= 0) return 0;
  if (availableTimeMin <= 15) return 3;
  if (availableTimeMin <= 30) return 4;
  if (availableTimeMin <= 45) return 5;
  return 6;
}

/**
 * Shortest between-set rest (seconds) the duration cap may compress a MAIN exercise
 * to before it is allowed to drop a whole exercise (short sessions only — a 10-min
 * session with the 120-165 s strength staircase fits ~1 exercise). Longer sessions
 * keep a near-staircase floor.
 *   ≤10 → 40 · ≤15 → 45 · ≤20 → 60 · ≤30 → 60 · >30 → 75
 */
export function shortSessionRestFloor(availableTimeMin: number | undefined): number {
  if (!availableTimeMin || availableTimeMin <= 0) return 75;
  if (availableTimeMin <= 10) return 40;
  if (availableTimeMin <= 15) return 45;
  if (availableTimeMin <= 30) return 60;
  return 75;
}
