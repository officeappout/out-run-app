'use client';

/**
 * useSessionGoalProgress
 * ----------------------
 * Single source-of-truth for "how far through their goal is the user?".
 * Reads `sessionGoal` from `useRunningPlayer` and divides it by the live
 * total from `useSessionStore` / `useRunningPlayer` to produce a 0–1
 * progress value the RouteStoryBar can paint.
 *
 * Returns `null` when no goal is set so callers can decide whether to
 * render the bar at all (vs. paint a 0% bar — the latter would look
 * like a stalled workout to the user).
 *
 * Unit contract (matches `SessionGoal` jsdoc in useRunningPlayer):
 *   - distance → km / km
 *   - time     → seconds / seconds
 *   - calories → kcal / kcal
 *
 * Progress is clamped to [0, 1]. Once `progress >= 1` we also flip
 * `isComplete` so the cluster / story bar can switch to a "goal hit"
 * styling without re-deriving the comparison.
 */

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../store/useRunningPlayer';

export interface SessionGoalProgress {
  /** 0–1, clamped. */
  progress: number;
  /** True once the live metric has reached or exceeded the target. */
  isComplete: boolean;
  /** Goal type for callers that want to colour-code by metric. */
  type: 'distance' | 'time' | 'calories';
  /** Raw target value (km / sec / kcal). */
  targetValue: number;
  /** Live current value in the same unit as `targetValue`. */
  currentValue: number;
}

export function useSessionGoalProgress(): SessionGoalProgress | null {
  const goal = useRunningPlayer((s) => s.sessionGoal);
  const totalDistance = useSessionStore((s) => s.totalDistance); // km
  const totalDuration = useSessionStore((s) => s.totalDuration); // sec
  const totalCalories = useRunningPlayer((s) => s.totalCalories); // kcal

  if (!goal || !Number.isFinite(goal.value) || goal.value <= 0) return null;

  let current = 0;
  switch (goal.type) {
    case 'distance':
      current = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0;
      break;
    case 'time':
      current = Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0;
      break;
    case 'calories':
      current = Number.isFinite(totalCalories) && totalCalories > 0 ? totalCalories : 0;
      break;
  }

  const ratio = current / goal.value;
  // Clamp so a slight overshoot doesn't blow the bar past 100%; the
  // caller uses `isComplete` to know about the overshoot.
  const progress = Math.max(0, Math.min(1, ratio));

  return {
    progress,
    isComplete: ratio >= 1,
    type: goal.type,
    targetValue: goal.value,
    currentValue: current,
  };
}
