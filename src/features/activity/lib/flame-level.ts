/**
 * flameLevelForDay — PURE, the ONE rule behind every flame / day dot under
 * enable_flame_tiers_v1 (home weekly strip, v2 capsules, summary week dots).
 *
 *   0  no flame. `started` = some workout happened that day but it doesn't qualify
 *      → a small neutral "started" mark, not a flame.
 *   1  small flame: the day counts for the streak (≥10 active minutes OR the step goal —
 *      the streak engine's own isDayClosed, unchanged).
 *   2  medium flame: qualifies AND one domain goal met — strength (the daily set gate,
 *      strength-day-gate.ts, as saved on dailyProgress; local logs only for today) OR aerobic
 *      (RECORDED run / walk minutes ≥ the day's cardio goal, or a planned run / walk done).
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
  /** The day's dailyActivity (minutes per category, steps, step goal); null/undefined = not on the device. */
  activity: FlameActivityDay | null | undefined;
  /** Completed non-recovery strength sets known locally (today's in-progress state). */
  strengthSets: number;
  /** The day's strength set target (0 = rest day / no program / no budget). */
  strengthTargetSets: number;
  /** Server-saved dailyProgress.strengthGoalMet (the done gate, any device). */
  strengthGoalSaved?: boolean;
  /** RECORDED run / walk minutes that day (dailyProgress.aerobicWorkoutMinutes) — never passive minutes. */
  aerobicMinutes?: number;
  /** A planned run or walk was completed that day (the plan's own done state). */
  aerobicPlanDone?: boolean;
  /** When the day's activity isn't on the device: the saved day counted (workoutCompleted / stepGoalMet). */
  qualifiesSaved?: boolean;
  /** An OUT workout was finished that day (even a short one). */
  workoutLogged?: boolean;
}

export interface FlameDay {
  level: FlameLevel;
  /** Level 0 but a workout happened — the neutral "started" mark. */
  started: boolean;
  strengthMet: boolean;
  aerobicMet: boolean;
  /** Level 1 with no workout at all (steps / passive movement) → the steps (orange) flame. */
  stepsOnly: boolean;
}

/**
 * The aerobic daily goal (owner 26.10.2026): RECORDED run / walk minutes reach the day's cardio
 * goal (default 30), or a planned run / walk was completed. Passive health minutes don't count
 * here (they still count for the streak, level 1).
 */
export function aerobicGoalMet(
  aerobicMinutes: number | null | undefined,
  activity?: FlameActivityDay | null,
  planDone = false,
): boolean {
  if (planDone) return true;
  const minutes = Number(aerobicMinutes) || 0;
  const goal = Number(activity?.categories?.cardio?.goalMinutes);
  const target = Number.isFinite(goal) && goal > 0 ? goal : AEROBIC_GOAL_FALLBACK_MIN;
  return minutes > 0 && minutes >= target;
}

function anySessions(activity: FlameActivityDay | null | undefined): boolean {
  return Object.values(activity?.categories ?? {}).some((c) => (Number(c?.sessions) || 0) > 0);
}

export function flameLevelForDay(input: FlameDayInput): FlameDay {
  const sets = Math.max(0, Number(input.strengthSets) || 0);
  const aerobicMin = Math.max(0, Number(input.aerobicMinutes) || 0);
  const qualifies = input.activity ? isDayClosed(input.activity) : !!input.qualifiesSaved;
  const strengthMet = input.strengthGoalSaved === true || (sets > 0 && strengthDayGoalMet(sets, input.strengthTargetSets));
  const aerobicMet = aerobicGoalMet(aerobicMin, input.activity, !!input.aerobicPlanDone);
  const goals = Number(strengthMet) + Number(aerobicMet);
  const level: FlameLevel = !qualifies ? 0 : goals === 2 ? 3 : goals === 1 ? 2 : 1;
  const anyWorkout = !!input.workoutLogged || sets > 0 || aerobicMin > 0 || !!input.aerobicPlanDone
    || input.strengthGoalSaved === true || anySessions(input.activity);
  return {
    level,
    started: level === 0 && anyWorkout,
    strengthMet,
    aerobicMet,
    stepsOnly: level === 1 && !anyWorkout,
  };
}

export const NO_FLAME: FlameDay = { level: 0, started: false, strengthMet: false, aerobicMet: false, stepsOnly: false };
