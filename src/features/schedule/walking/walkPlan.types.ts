/**
 * Walking plan — public shapes (enable_home_v2). See walkPlan.ts.
 */
import type { TimeWindow } from '../engine-v2/types';

/** The walk goal question (WR-3a). */
export type WalkGoal = 'weight_loss' | 'health' | 'steps' | 'belly';

/** "כמה זמן נוח לך ללכת?" — עד 15 / 20–30 / 45+ דק׳. */
export type WalkComfort = 'short' | 'medium' | 'long';

/** From the median of the user's recent daily steps. */
export type WalkActivityLevel = 'sedentary' | 'low' | 'moderate' | 'active';

export type WalkAudience = 'senior' | 'general' | 'athlete';

/** One walk's simple target — what the free walk player's goal card shows. */
export type WalkTarget = { type: 'time'; minutes: number } | { type: 'distance'; km: number };

export interface WalkPlanInput {
  goal: WalkGoal;
  comfort: WalkComfort;
  /**
   * The user's adaptive step goal (#414: median of the last 14 days × 1.1), or null
   * when there is not enough step data yet (treated as "low" activity).
   */
  stepGoal: number | null;
  /** Days the user can walk (0 = Sunday). Saturday is off unless they mark it. */
  availableDays: number[];
  audience: WalkAudience;
}

export interface PlannedWalk {
  dow: number;
  /** The walk's length in minutes (for a distance target, the estimate). */
  minutes: number;
  target: WalkTarget;
  /** The week's one longer walk. */
  isLong: boolean;
  /** ≈ steps this walk adds (minutes × steps/min). */
  estSteps: number;
}

export interface WalkWeek {
  /** 0 = the first week. */
  index: number;
  totalMinutes: number;
  walks: PlannedWalk[];
}

export interface WalkPlan {
  level: WalkActivityLevel;
  /** The weekly minutes the plan ramps towards (WHO band, by goal / audience). */
  targetWeeklyMinutes: number;
  /**
   * The weekly minutes these days can actually hold (≤ targetWeeklyMinutes): one long
   * walk ≤ longWalkMax + the others ≤ session.max. Below the target → a reason says so
   * honestly ("עד 105 דק׳ עם 2 ימים — …"); the WHO target itself is unchanged.
   */
  plannedWeeklyMinutes: number;
  /** Walks a week (3–5, never more than the available days). */
  frequency: number;
  /** The days chosen (sorted). */
  days: number[];
  weeks: WalkWeek[];
  /** Short Hebrew reasons, most important first. */
  reasonsHe: string[];
}

export interface WalkSession {
  dow: number;
  window: TimeWindow;
}
