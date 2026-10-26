/** A dailyProgress doc → the fields flameLevelForDay reads (enable_flame_tiers_v1). PURE. */
import type { SavedDayGoals } from './flame-day-input';

export type { SavedDayGoals };

export function savedDayGoalsOf(data: Record<string, unknown> | null | undefined): SavedDayGoals | null {
  if (!data) return null;
  const out: SavedDayGoals = {};
  if (typeof data.strengthGoalMet === 'boolean') out.strengthGoalMet = data.strengthGoalMet;
  if (typeof data.aerobicWorkoutMinutes === 'number') out.aerobicWorkoutMinutes = data.aerobicWorkoutMinutes;
  if (data.workoutCompleted === true) out.workoutCompleted = true;
  if (data.stepGoalMet === true) out.stepGoalMet = true;
  return out;
}
