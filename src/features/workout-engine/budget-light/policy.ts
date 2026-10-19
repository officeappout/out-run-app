/**
 * Budget light mode — the ONE policy for "the strength set budget is spent" (owner decision,
 * 19.10.2026; panel flag enable_budget_light_mode, default OFF).
 *
 * Spent budget never blocks strength and never swaps it for a recovery stretch or a core
 * tabata. A RECOMMENDED session becomes a LIGHTER strength session instead (fewer sets, the
 * easy bolt, the user's own exercises) and says why. A session the user builds himself
 * (entry 'manual') is never restricted by the budget at all — the callers strip the budget
 * inputs for it (see trio-gate.ts).
 *
 * Pure: plain numbers in, a decision out. No store, no Firebase, no flag read (the caller
 * passes `enabled`).
 */

/** Below this many remaining weekly strength sets the week counts as spent (the old home floor). */
export const LIGHT_MODE_REMAINING_THRESHOLD = 6;
/** A light session's main work never goes above this many sets. */
export const LIGHT_SESSION_SETS_CAP = 8;
/** A light session is short: fewer exercises, each with a couple of real sets (not 1-set slivers). */
export const LIGHT_SESSION_MINUTES_CAP = 20;
/** A light session uses the easy bolt (D1: level −1 picks, lower rep ratio — still strength). */
export const LIGHT_INTENSITY_CAP = 1 as const;

export type BudgetEntry = 'recommended' | 'manual';
export type BudgetLightMode = 'normal' | 'light';
export type BudgetLightReasonKey = 'budget_light.weekly_spent' | 'budget_light.daily_spent';

/** What the device knows about this week's strength sets (useWeeklyVolumeStore, snapshot.ts). */
export interface StrengthBudgetSnapshot {
  /** <= 0 or not finite = the store was never initialised → unknown, never "spent". */
  weeklyBudget: number;
  totalSetsCompleted: number;
  /** Strength sets finished today (non-recovery sessions). null/absent = unknown. */
  setsDoneToday?: number | null;
  /** Training days in the user's week (profile.lifestyle.scheduleDays). null/absent = unknown. */
  trainingDaysPerWeek?: number | null;
}

export interface BudgetLightInput {
  enabled: boolean;
  entry: BudgetEntry;
  snapshot?: StrengthBudgetSnapshot | null;
  /**
   * Fallback when no snapshot is passed: the caller's already-computed remaining weekly sets
   * (HomeWorkoutOptions.remainingWeeklyBudget — the value the old recovery floor read).
   */
  remainingWeeklySets?: number | null;
}

export interface BudgetLightDecision {
  mode: BudgetLightMode;
  /** Max main-work sets for the session; null = no cap. */
  setsCap: number | null;
  /** Max difficulty bolt (1-3); null = no cap. */
  intensityCap: 1 | 2 | 3 | null;
  /** Copy key for the "why" line (copy.ts); null in normal mode. */
  reasonKey: BudgetLightReasonKey | null;
}

export const NORMAL_DECISION: BudgetLightDecision = Object.freeze({
  mode: 'normal', setsCap: null, intensityCap: null, reasonKey: null,
}) as BudgetLightDecision;

const light = (reasonKey: BudgetLightReasonKey): BudgetLightDecision => ({
  mode: 'light', setsCap: LIGHT_SESSION_SETS_CAP, intensityCap: LIGHT_INTENSITY_CAP, reasonKey,
});

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Remaining weekly strength sets, or null when unknown. */
export function remainingWeeklyStrengthSets(input: Pick<BudgetLightInput, 'snapshot' | 'remainingWeeklySets'>): number | null {
  const s = input.snapshot;
  if (s && isPos(s.weeklyBudget)) return Math.max(0, s.weeklyBudget - (Number.isFinite(s.totalSetsCompleted) ? s.totalSetsCompleted : 0));
  const r = input.remainingWeeklySets;
  if (typeof r === 'number' && Number.isFinite(r)) return Math.max(0, r);
  return null;
}

/** Today's share of the weekly budget is done (needs a valid snapshot with today's sets + week days). */
export function isDailyStrengthBudgetSpent(s: StrengthBudgetSnapshot | null | undefined): boolean {
  if (!s || !isPos(s.weeklyBudget) || !isPos(s.setsDoneToday) || !isPos(s.trainingDaysPerWeek)) return false;
  const dailyBudget = Math.ceil(s.weeklyBudget / Math.max(1, Math.round(s.trainingDaysPerWeek)));
  return s.setsDoneToday >= dailyBudget;
}

export function resolveBudgetLightMode(input: BudgetLightInput): BudgetLightDecision {
  if (!input.enabled || input.entry === 'manual') return NORMAL_DECISION;
  const remaining = remainingWeeklyStrengthSets(input);
  if (remaining != null && remaining < LIGHT_MODE_REMAINING_THRESHOLD) return light('budget_light.weekly_spent');
  if (isDailyStrengthBudgetSpent(input.snapshot)) return light('budget_light.daily_spent');
  return NORMAL_DECISION;
}
