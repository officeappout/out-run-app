/**
 * Smart Goals Service
 * Implements adaptive goal adjustment based on 3-day success/failure window
 * Differentiates between "Survival Mode" (baseline) and "Winning" (adaptive goal)
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GoalHistoryEntry, ActivityType } from '../store/useProgressionStore';

const USERS_COLLECTION = 'users';

/**
 * Constants for the Two-Speed System
 */
export const SUCCESS_BASELINE = {
  steps: 1500,   // Minimum to "survive" (save streak, no reward)
  floors: 1,     // Minimum floors to survive
};

export const DEFAULT_GOALS = {
  steps: 3000,   // Starting adaptive goal
  floors: 3,     // Starting adaptive floors goal
};

export const ADJUSTMENT = {
  successMultiplier: 1.10,  // +10% on 3-day success
  failureMultiplier: 0.95,  // -5% on 3-day failure (gentler decline)
};

/**
 * Goals interface
 */
export interface Goals {
  dailyStepGoal: number;
  dailyFloorGoal: number;
}

/**
 * Progress evaluation result
 */
export interface ProgressEvaluation {
  hitBaseline: boolean;      // Survival mode - streak saved, no reward
  hitAdaptiveGoal: boolean;  // Winning mode - full reward + celebration
  activityType: ActivityType;
  stepGoalMet: boolean;
  floorGoalMet: boolean;
}

/**
 * Evaluate daily progress against baseline and adaptive goals
 * 
 * KEY LOGIC:
 * - Hitting Baseline (1500 steps OR 1 floor) = SURVIVAL MODE (saves streak, no reward)
 * - Hitting Adaptive Goal (e.g., 3000 steps OR 3 floors) = WINNING MODE (reward + celebration)
 */
export function evaluateDailyProgress(
  steps: number,
  floors: number,
  goals: Goals
): ProgressEvaluation {
  // Baseline check (EITHER metric saves streak)
  const hitStepBaseline = steps >= SUCCESS_BASELINE.steps;
  const hitFloorBaseline = floors >= SUCCESS_BASELINE.floors;
  const hitBaseline = hitStepBaseline || hitFloorBaseline;

  // Adaptive goal check (EITHER metric triggers reward)
  const hitStepGoal = steps >= goals.dailyStepGoal;
  const hitFloorGoal = floors >= goals.dailyFloorGoal;
  const hitAdaptiveGoal = hitStepGoal || hitFloorGoal;

  // Determine activity type for UI
  let activityType: ActivityType = 'none';
  if (hitAdaptiveGoal) {
    activityType = 'micro'; // Goal hit - full reward
  } else if (hitBaseline) {
    activityType = 'survival'; // Baseline only - streak saved, no reward
  }

  return {
    hitBaseline,
    hitAdaptiveGoal,
    activityType,
    stepGoalMet: hitStepGoal,
    floorGoalMet: hitFloorGoal,
  };
}

/**
 * Recalculate goals based on 3-day history window
 * Uses adaptive algorithm: +10% on success, -5% on failure
 * Goals never drop below SUCCESS_BASELINE
 */
export function recalculateGoals(
  history: GoalHistoryEntry[],
  currentGoals: Goals
): Goals {
  // Need at least 3 days of history to adjust
  if (history.length < 3) {
    return currentGoals;
  }

  // Get last 3 days
  const lastThreeDays = history.slice(0, 3);

  // Check if ALL 3 days met goals (success window)
  const stepsSuccess = lastThreeDays.every(entry => entry.stepGoalMet);
  const floorsSuccess = lastThreeDays.every(entry => entry.floorGoalMet);

  // Check if ALL 3 days failed (failure window)
  const stepsFailure = lastThreeDays.every(entry => !entry.stepGoalMet);
  const floorsFailure = lastThreeDays.every(entry => !entry.floorGoalMet);

  let newStepGoal = currentGoals.dailyStepGoal;
  let newFloorGoal = currentGoals.dailyFloorGoal;

  // Adjust step goal
  if (stepsSuccess) {
    newStepGoal = Math.round(currentGoals.dailyStepGoal * ADJUSTMENT.successMultiplier);
    console.log(`✅ [SmartGoals] Step goal INCREASED: ${currentGoals.dailyStepGoal} → ${newStepGoal}`);
  } else if (stepsFailure) {
    newStepGoal = Math.round(currentGoals.dailyStepGoal * ADJUSTMENT.failureMultiplier);
    // Never drop below baseline
    newStepGoal = Math.max(newStepGoal, SUCCESS_BASELINE.steps);
    console.log(`📉 [SmartGoals] Step goal DECREASED: ${currentGoals.dailyStepGoal} → ${newStepGoal}`);
  }

  // Adjust floor goal
  if (floorsSuccess) {
    newFloorGoal = Math.round(currentGoals.dailyFloorGoal * ADJUSTMENT.successMultiplier);
    console.log(`✅ [SmartGoals] Floor goal INCREASED: ${currentGoals.dailyFloorGoal} → ${newFloorGoal}`);
  } else if (floorsFailure) {
    newFloorGoal = Math.round(currentGoals.dailyFloorGoal * ADJUSTMENT.failureMultiplier);
    // Never drop below baseline
    newFloorGoal = Math.max(newFloorGoal, SUCCESS_BASELINE.floors);
    console.log(`📉 [SmartGoals] Floor goal DECREASED: ${currentGoals.dailyFloorGoal} → ${newFloorGoal}`);
  }

  return {
    dailyStepGoal: newStepGoal,
    dailyFloorGoal: newFloorGoal,
  };
}

/**
 * Record daily activity and update goals
 * Called at end of day or when user manually checks progress
 */
export async function recordDailyActivity(
  userId: string,
  steps: number,
  floors: number,
  currentGoals: Goals,
  history: GoalHistoryEntry[]
): Promise<{
  evaluation: ProgressEvaluation;
  newGoals: Goals;
  streakSaved: boolean;
}> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const today = new Date().toISOString().split('T')[0];

    // Evaluate progress
    const evaluation = evaluateDailyProgress(steps, floors, currentGoals);

    // Create history entry
    const newEntry: GoalHistoryEntry = {
      date: today,
      stepsAchieved: steps,
      floorsAchieved: floors,
      stepGoalMet: evaluation.stepGoalMet,
      floorGoalMet: evaluation.floorGoalMet,
    };

    // Update history (keep last 3 days)
    const updatedHistory = [newEntry, ...history].slice(0, 3);

    // Recalculate goals if we have enough history
    const newGoals = recalculateGoals(updatedHistory, currentGoals);

    // Update Firestore
    await updateDoc(userDocRef, {
      'progression.dailyStepGoal': newGoals.dailyStepGoal,
      'progression.dailyFloorGoal': newGoals.dailyFloorGoal,
      'progression.goalHistory': updatedHistory,
      'progression.currentStreak': evaluation.hitBaseline
        ? (history[0]?.date === today ? history.length : history.length + 1)
        : 0, // Reset streak if baseline not hit
    });

    console.log(
      `✅ [SmartGoals] Recorded activity for user ${userId}` +
        ` | Activity: ${evaluation.activityType}` +
        ` | Baseline: ${evaluation.hitBaseline}` +
        ` | Goal: ${evaluation.hitAdaptiveGoal}`
    );

    return {
      evaluation,
      newGoals,
      streakSaved: evaluation.hitBaseline,
    };
  } catch (error) {
    console.error('[SmartGoals] Error recording daily activity:', error);
    throw error;
  }
}

/**
 * Get recommended starting goals based on user activity level
 * Can be used during onboarding or profile setup
 */
export function getRecommendedStartingGoals(activityLevel: 'low' | 'medium' | 'high'): Goals {
  const recommendations = {
    low: { dailyStepGoal: 2000, dailyFloorGoal: 2 },
    medium: { dailyStepGoal: 3000, dailyFloorGoal: 3 },
    high: { dailyStepGoal: 5000, dailyFloorGoal: 5 },
  };

  return recommendations[activityLevel];
}

/**
 * Initialize goals for new user
 */
export async function initializeGoals(userId: string, activityLevel: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const goals = getRecommendedStartingGoals(activityLevel);

    await updateDoc(userDocRef, {
      'progression.dailyStepGoal': goals.dailyStepGoal,
      'progression.dailyFloorGoal': goals.dailyFloorGoal,
      'progression.currentStreak': 0,
      'progression.goalHistory': [],
    });

    console.log(`✅ [SmartGoals] Initialized goals for user ${userId}: ${JSON.stringify(goals)}`);
  } catch (error) {
    console.error('[SmartGoals] Error initializing goals:', error);
  }
}
