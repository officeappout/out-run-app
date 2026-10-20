/**
 * Extra strength on a day you already did strength (enable_home_v2, owner 20.10.2026).
 * PURE. It depends on the DAILY strength goal — the same one the Daily Strength Ring fills:
 *   target = the lead program's weekly set budget ÷ schedule days (useDailyStrengthTarget,
 *            dailyStrengthTarget.ts; 0 on a rest day),
 *   done   = today's completed non-recovery sets (useTodayStrengthVolume, session logs).
 *
 *  - no strength today              → 'none'      (nothing changes — the usual next-up rules);
 *  - strength today, goal reached   → 'goal-met'  (no more strength cards today);
 *  - strength today, part of the goal → 'top-up'  ("אימון משלים": the engine's
 *    partial-completion card, built from the per-domain gap, titled
 *    "השלמת סטים · נשארו X סטים להיום"; every other strength card drops).
 * A rest day (target 0) never asks for more strength. A gap below MIN_TOP_UP_SETS is not a
 * workout — it counts as reached.
 */

export type StrengthTopUp =
  | { mode: 'none' }
  | { mode: 'goal-met' }
  | { mode: 'top-up'; remainingSets: number };

/** One set left is not worth a workout card. */
export const MIN_TOP_UP_SETS = 2;

export interface StrengthTopUpInput {
  /** A strength (or hybrid) workout was completed today. */
  strengthDoneToday: boolean;
  /** The day's set target (0 on a rest day). */
  targetSets: number;
  /** Today's completed sets. */
  completedSets: number;
}

export function resolveStrengthTopUp({ strengthDoneToday, targetSets, completedSets }: StrengthTopUpInput): StrengthTopUp {
  if (!strengthDoneToday) return { mode: 'none' };
  const target = Math.max(0, Math.round(Number(targetSets) || 0));
  const done = Math.max(0, Math.round(Number(completedSets) || 0));
  const remaining = target - done;
  if (target <= 0 || remaining < MIN_TOP_UP_SETS) return { mode: 'goal-met' };
  return { mode: 'top-up', remainingSets: remaining };
}

/** The engine's "finish today's sets" generator (partial-completion.generator.ts). */
export const TOP_UP_GENERATOR_ID = 'partial-completion';

/**
 * The post-workout cards under the rule: goal met → every strength card goes; top-up → only
 * the partial-completion card stays among the strength cards; none → unchanged.
 */
export function applyStrengthTopUp<T extends { generatorId: string }>(
  items: readonly T[],
  topUp: StrengthTopUp,
  isStrength: (t: T) => boolean,
): T[] {
  if (topUp.mode === 'none') return [...items];
  if (topUp.mode === 'goal-met') return items.filter((t) => !isStrength(t));
  return items.filter((t) => !isStrength(t) || t.generatorId === TOP_UP_GENERATOR_ID);
}

/** "השלמת סטים · נשארו 6 סטים להיום" (1 → "נשאר סט אחד"). */
export function topUpTitleHe(remainingSets: number): string {
  const n = Math.max(0, Math.round(remainingSets));
  return n === 1 ? 'השלמת סטים · נשאר סט אחד להיום' : `השלמת סטים · נשארו ${n} סטים להיום`;
}
