/**
 * Strength "done for today" gate — PURE, the one place the bar is computed.
 *
 *   legacy (HOME_DAILY_GOAL_V1, flame tiers off): met = no target (rest day / no budget)
 *          OR completed ≥ ceil(⅔ × daily target).
 *   tiers  (enable_flame_tiers_v1, owner 26.10.2026): met = completed ≥ ceil(⅔ × daily target)
 *          AND completed ≥ 4. No target (rest day / no budget): completed ≥ 4.
 *
 * Daily target = the lead program's weekly set budget ÷ schedule days (dailyStrengthTarget.ts).
 * Used by the completion write (useActivitySync → markTodayAsCompleted), the home top-up card
 * and flameLevelForDay (activity/lib/flame-level.ts).
 */

/** The floor under the ⅔ rule (enable_flame_tiers_v1): fewer sets is never "done for today". */
export const STRENGTH_DONE_MIN_SETS = 4;

export type StrengthGateRule = 'legacy' | 'tiers';

function whole(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

/** Sets needed for "done for today" given the day's target. */
export function strengthDoneThreshold(targetSets: number, rule: StrengthGateRule = 'tiers'): number {
  const target = whole(targetSets);
  const twoThirds = target > 0 ? Math.ceil((target * 2) / 3) : 0;
  return rule === 'tiers' ? Math.max(STRENGTH_DONE_MIN_SETS, twoThirds) : twoThirds;
}

/** Did today's completed sets reach the bar? */
export function strengthDayGoalMet(completedSets: number, targetSets: number, rule: StrengthGateRule = 'tiers'): boolean {
  return whole(completedSets) >= strengthDoneThreshold(targetSets, rule);
}

export interface StrengthCompletion {
  targetSets: number;
  completedSets: number;
  /** completed / target, clamped 0–1 (1 when there is no target). */
  pct: number;
  met: boolean;
}

/** The snapshot persisted on dailyProgress (dailyStrengthTargetSets / …Pct / strengthGoalMet). */
export function strengthCompletionSnapshot(
  targetSets: number,
  completedSets: number,
  rule: StrengthGateRule,
): StrengthCompletion {
  const target = whole(targetSets);
  const done = whole(completedSets);
  const pct = target <= 0 ? 1 : Math.max(0, Math.min(1, done / target));
  return { targetSets: target, completedSets: done, pct, met: strengthDayGoalMet(done, target, rule) };
}
