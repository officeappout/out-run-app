/**
 * Walking plan — the numbers (enable_home_v2, owner 20.10.2026).
 *
 * Plain JSON-safe data, like recommendation-policy/policy.config.ts: the pure
 * algorithm (walkPlan.ts) reads only this object, so the same shape can later come
 * from a Firestore config doc / admin without touching the code.
 *
 * Anchor: WHO physical-activity guidance — adults 150–300 min/week of moderate
 * activity (brisk walking counts); older adults the same, plus balance work.
 * We never jump to the target: the week starts from the user's current activity
 * (estimated from their adaptive step goal, #414) and ramps by ≤ 10% a week.
 */
import type { WalkActivityLevel, WalkComfort, WalkGoal } from './walkPlan.types';

export interface WalkPlanConfig {
  version: number;
  /** WHO weekly minutes of moderate activity (adults). */
  who: { minWeeklyMinutes: number; maxWeeklyMinutes: number };
  /** Weekly-minutes target per goal (inside the WHO band). */
  goalTargetMinutes: Record<WalkGoal, number>;
  /** Older adults: the target is capped here (WHO minimum) and a balance note is shown. */
  seniorTargetMinutes: number;
  /** Estimated brisk minutes a week the user already does, by activity level. */
  startMinutesByLevel: Record<WalkActivityLevel, number>;
  /** Median daily steps → activity level (upper bounds, exclusive). */
  levelStepBounds: { sedentary: number; low: number; moderate: number };
  /** The adaptive step goal is median × this (step-goal.ts STEP_GOAL_STRETCH). */
  stepGoalStretch: number;
  /** Max growth of the weekly minutes from one week to the next. */
  weeklyRampCap: number;
  /** One walk's length bounds (minutes). */
  session: { min: number; max: number };
  /** The usual walk length the user said is comfortable (WR-3a). */
  comfortSessionMinutes: Record<WalkComfort, number>;
  /** Walks a week. */
  frequency: { min: number; max: number };
  /** The week's one longer walk: × the usual walk, capped at session.max. */
  longWalkFactor: number;
  /** Brisk walking ≈ this many steps per minute (display / step tie-in). */
  stepsPerMinute: number;
  /** Brisk walking ≈ this many km per minute (distance targets). */
  kmPerMinute: number;
  /** Distance targets are rounded to this (km). */
  distanceStepKm: number;
  /** "Close the gap" short walk bounds (minutes). */
  gapWalk: { min: number; max: number };
  /** How many weeks ahead the plan is written to the schedule. */
  horizonWeeks: number;
}

export const WALK_PLAN_CONFIG: WalkPlanConfig = {
  version: 1,
  who: { minWeeklyMinutes: 150, maxWeeklyMinutes: 300 },
  goalTargetMinutes: {
    weight_loss: 250,
    health: 150,
    steps: 150,
    belly: 200,
  },
  seniorTargetMinutes: 150,
  startMinutesByLevel: {
    sedentary: 60,
    low: 90,
    moderate: 120,
    active: 150,
  },
  levelStepBounds: { sedentary: 5000, low: 7500, moderate: 10000 },
  stepGoalStretch: 1.1,
  weeklyRampCap: 0.1,
  session: { min: 20, max: 45 },
  comfortSessionMinutes: { short: 20, medium: 30, long: 40 },
  frequency: { min: 3, max: 5 },
  longWalkFactor: 1.4,
  stepsPerMinute: 110,
  kmPerMinute: 0.09,
  distanceStepKm: 0.5,
  gapWalk: { min: 10, max: 30 },
  horizonWeeks: 4,
};
