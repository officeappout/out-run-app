/**
 * Daily strength target — pure derivation for the Daily Strength Ring (Layer A).
 *
 * The ring's denominator is a STABLE daily target = weekly per-level volume ÷
 * schedule days. We deliberately do NOT use the engine's `dailySetBudget`
 * (deficit-aware, shifts as sets are completed — that is Layer B territory).
 * Stable inputs (level, scheduleDays, weeklyVolumeTarget) → a target that does
 * not jump between renders.
 *
 * Rest/off-day closure: on a non-training day the ring shows a recovery state
 * (targetSets = 0), never a strength target. Detected synchronously from
 * `scheduleDays` + `recurringTemplate` (matches SmartWeeklySchedule /
 * StatsOverview `isImplicitOffDay`). Explicit Firestore rest/training entries
 * are an async edge, deferred.
 *
 * Pure functions only (unit-testable in node/vitest); `useDailyStrengthTarget`
 * is the thin hook that resolves the async weekly target and applies these.
 */

import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';

export type DailyStrengthTargetSource = 'lead' | 'fallback' | 'loading';

export interface DailyStrengthTarget {
  /** Sets that fill the ring today. 0 on a rest/off day. */
  targetSets: number;
  /** Weekly set target this daily value was derived from. */
  weeklyTarget: number;
  /** Schedule days used as the divisor (floored at 1). */
  scheduleDays: number;
  /** True on a rest/off day → recovery mode, no strength target. */
  isRestDay: boolean;
  /** Where `weeklyTarget` came from: 'lead' (program-level), 'fallback', or 'loading'. */
  source: DailyStrengthTargetSource;
}

type Leveled = { currentLevel?: number } | undefined;

/**
 * Highest current level across progression tracks + domains (min 1).
 * Mirrors the `baseLevel` computation in StatsOverview's budget-sync effect.
 */
export function computeBaseLevel(
  tracks?: Record<string, Leveled>,
  domains?: Record<string, Leveled>,
): number {
  const levels: number[] = [
    ...Object.values(tracks ?? {}).map((t) => t?.currentLevel ?? 1),
    ...Object.values(domains ?? {}).map((d) => d?.currentLevel ?? 1),
    1,
  ];
  return Math.max(...levels) || 1;
}

/**
 * Is today (or `date`) a scheduled training day? Synchronous, from the profile.
 * A training day exists when the day's Hebrew letter is in `scheduleDays` OR the
 * `recurringTemplate` has at least one program for that letter.
 */
export function isTodayTrainingDay(
  scheduleDays: string[] | undefined,
  recurringTemplate: Record<string, string[] | undefined> | undefined,
  date: Date = new Date(),
): boolean {
  const letter = getHebrewDayLetter(date);
  if ((scheduleDays ?? []).includes(letter)) return true;
  const templated = recurringTemplate?.[letter];
  return Array.isArray(templated) && templated.length > 0;
}

/**
 * Derive the stable daily target from a resolved weekly target.
 * Rest day → targetSets 0. Otherwise ceil(weekly / max(1, scheduleDays)).
 */
export function computeDailyStrengthTarget(input: {
  weeklyTarget: number;
  scheduleDays: number;
  isRestDay: boolean;
  source: DailyStrengthTargetSource;
}): DailyStrengthTarget {
  const days = Math.max(1, input.scheduleDays || 0);
  const weekly = Math.max(0, input.weeklyTarget || 0);
  const targetSets = input.isRestDay ? 0 : Math.ceil(weekly / days);
  return {
    targetSets,
    weeklyTarget: weekly,
    scheduleDays: days,
    isRestDay: input.isRestDay,
    source: input.source,
  };
}
