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
