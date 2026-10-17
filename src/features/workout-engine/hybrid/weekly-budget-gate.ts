/**
 * weekly-budget-gate — the route-stops "weekly strength budget spent → core" default,
 * extracted so it can be unit-tested without the Zustand store.
 *
 * Cold-store fix (hybrid route-stops audit, 17.10.2026): useWeeklyVolumeStore's
 * `strength.weeklyBudget` starts at 0 and is only initialised from the stats screen
 * (StatsOverview). Opening the map cold left it at 0 → getRemainingBudget() = 0 → every
 * strength stop was silently demoted to the same core tabata. A budget of 0 (or any
 * non-positive / non-finite value) is UNKNOWN, not "spent" — only a real, initialised
 * budget with fewer than MIN_COHERENT_STATION_SETS sets left counts as spent.
 *
 * Pure — no store, no Firebase.
 */

/** Below this many remaining weekly strength sets a strength station would be a 1–2 set sliver. */
export const MIN_COHERENT_STATION_SETS = 4;

export interface WeeklyStrengthBudgetState {
  weeklyBudget: number;
  totalSetsCompleted: number;
}

export function isWeeklyStrengthBudgetSpent(strength: WeeklyStrengthBudgetState | null | undefined): boolean {
  if (!strength) return false;
  const budget = strength.weeklyBudget;
  if (!Number.isFinite(budget) || budget <= 0) return false; // uninitialised → unknown, never "spent"
  const remaining = Math.max(0, budget - (strength.totalSetsCompleted || 0));
  return remaining < MIN_COHERENT_STATION_SETS;
}
