import { ActivityType } from '@/features/parks';

/**
 * Shared utility for calculating calories based on MET formula
 * Formula: Calories = (MET * Weight_kg * 3.5) / 200 * Duration_minutes
 * 
 * @param activity - The activity type (running, walking, cycling)
 * @param durationMinutes - Duration in minutes
 * @param weightKg - User weight in kg (default: 75kg)
 * @returns Estimated calories burned
 */
export function calculateCalories(
  activity: ActivityType,
  durationMinutes: number,
  weightKg?: number
): number {
  // Default weight if not available: 75kg
  const userWeight = weightKg || 75;
  
  // MET values (Metabolic Equivalent of Task)
  // Walking: 3.5 METs, Running: 8.0 METs, Cycling: 6.0 METs
  let metValue = 8.0; // Running default
  if (activity === 'walking') metValue = 3.5;
  if (activity === 'cycling') metValue = 6.0;
  
  // Formula: Calories = (MET * Weight_kg * 3.5) / 200 * Duration_minutes
  const calories = (metValue * userWeight * 3.5) / 200 * durationMinutes;
  return Math.round(calories);
}
