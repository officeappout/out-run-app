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

/**
 * Can a "core" stop actually run for this user? Mirrors dispatchStopContent's 'core' gate
 * (compose-hybrid-session.service.ts): when BOTH legs and core are unassessed the stop becomes
 * a lock card, and runHybridPlan strips lock cards from the run — the station disappears.
 * No level map = unknown → assessed (same `?? true` convention as the gate itself).
 */
export function isCoreStopRunnable(userProgramLevels: ReadonlyMap<string, unknown> | null | undefined): boolean {
  if (!userProgramLevels) return true;
  return userProgramLevels.has('core') || userProgramLevels.has('legs');
}

/**
 * The route-stops "weekly strength budget spent → core" default, applied only when it cannot
 * cost the user the station (owner report 19.10.2026, "הליכה + עצירות" showed no strength):
 * with the budget spent, every strength stop was demoted to core — and for a user with neither
 * core nor legs assessed that core stop was a lock card, stripped from the run, leaving a plain
 * walk. Such stops now stay strength. Returns the same array when nothing changes.
 */
export function applySpentBudgetCoreDefault<S extends { activityType?: string }>(
  stops: S[],
  strength: WeeklyStrengthBudgetState | null | undefined,
  userProgramLevels: ReadonlyMap<string, unknown> | null | undefined,
): { stops: S[]; reason: 'not_spent' | 'core_not_runnable' | 'defaulted_to_core' } {
  if (!isWeeklyStrengthBudgetSpent(strength)) return { stops, reason: 'not_spent' };
  if (!isCoreStopRunnable(userProgramLevels)) return { stops, reason: 'core_not_runnable' };
  return {
    stops: stops.map((s) => (s.activityType === 'strength' ? ({ ...s, activityType: 'core' } as S) : s)),
    reason: 'defaulted_to_core',
  };
}
