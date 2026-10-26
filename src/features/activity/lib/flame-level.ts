/**
 * flameLevelForDay — PURE, the ONE rule behind every flame / day dot under
 * enable_flame_tiers_v1 (home weekly strip, v2 capsules, summary week dots).
 *
 *   0  no flame. `started` = some workout happened that day but it doesn't qualify
 *      → a small neutral "started" mark, not a flame.
 *   1  small flame: the day counts for the streak (≥10 active minutes OR the step goal —
 *      the streak engine's own isDayClosed, unchanged).
 *   2  medium flame: qualifies AND one domain goal met — strength (the daily set gate,
 *      strength-day-gate.ts) OR aerobic (the day's cardio minutes ≥ its cardio goal).
 *   3  big flame: qualifies AND both domain goals met.
 *
 * The header streak COUNT is not derived from here (still the streak engine).
 */
import { isDayClosed, type StreakDayCounts } from './streak-day.core';
import { strengthDayGoalMet } from '@/features/home/utils/strength-day-gate';

export type FlameLevel = 0 | 1 | 2 | 3;

/** Daily aerobic goal fallback — mirrors the cardio category's default goalMinutes (useWeeklyMovementGoal). */
export const AEROBIC_GOAL_FALLBACK_MIN = 30;

type CategoryCounts = { minutes?: number; goalMinutes?: number | null; sessions?: number | null };

/** A dailyActivity day (or the parts of it the rule reads). */
export interface FlameActivityDay extends StreakDayCounts {
  categories?: Record<string, CategoryCounts | null | undefined> | null;
}

export interface FlameDayInput {
  /** The day's dailyActivity (minutes per category, steps, step goal). */
  activity: FlameActivityDay | null | undefined;
  /** Completed non-recovery strength sets that day. */
  strengthSets: number;
  /** The day's strength set target (0 = rest day / no program / no budget). */
  strengthTargetSets: number;
  /** An OUT workout was finished that day (even a short one). */
  workoutLogged?: boolean;
}

export interface FlameDay {
  level: FlameLevel;
  /** Level 0 but a workout happened — the neutral "started" mark. */
  started: boolean;
  strengthMet: boolean;
  aerobicMet: boolean;
}

/** The aerobic daily goal: the day's cardio minutes reach its cardio goal (default 30). */
export function aerobicGoalMet(activity: FlameActivityDay | null | undefined): boolean {
  const cardio = activity?.categories?.cardio;
  const minutes = Number(cardio?.minutes) || 0;
  const goal = Number(cardio?.goalMinutes);
  const target = Number.isFinite(goal) && goal > 0 ? goal : AEROBIC_GOAL_FALLBACK_MIN;
  return minutes > 0 && minutes >= target;
}

function anySessions(activity: FlameActivityDay | null | undefined): boolean {
  return Object.values(activity?.categories ?? {}).some((c) => (Number(c?.sessions) || 0) > 0);
}

export function flameLevelForDay(input: FlameDayInput): FlameDay {
  const sets = Math.max(0, Number(input.strengthSets) || 0);
  const qualifies = isDayClosed(input.activity);
  const strengthMet = sets > 0 && strengthDayGoalMet(sets, input.strengthTargetSets);
  const aerobicMet = aerobicGoalMet(input.activity);
  const goals = Number(strengthMet) + Number(aerobicMet);
  const level: FlameLevel = !qualifies ? 0 : goals === 2 ? 3 : goals === 1 ? 2 : 1;
  const started = level === 0 && (!!input.workoutLogged || sets > 0 || anySessions(input.activity));
  return { level, started, strengthMet, aerobicMet };
}

export const NO_FLAME: FlameDay = { level: 0, started: false, strengthMet: false, aerobicMet: false };
