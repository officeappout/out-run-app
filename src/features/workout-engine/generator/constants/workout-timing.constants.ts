/**
 * Workout Timing Constants
 * Used for calculating total workout duration
 */

/**
 * Transition time between exercises (in seconds)
 * This is the time it takes to move from one exercise to the next
 */
export const TRANSITION_TIME_SECONDS = 10;

/**
 * Default seconds per rep (if not specified in exercise)
 */
export const DEFAULT_SECONDS_PER_REP = 3;

/**
 * Default rest seconds between sets (if not specified in exercise)
 */
export const DEFAULT_REST_SECONDS = 30;

/**
 * Calculate exercise duration based on reps, seconds per rep, and rest
 * @param reps - Number of reps
 * @param sets - Number of sets
 * @param secondsPerRep - Seconds per rep (default: 3)
 * @param restSeconds - Rest seconds between sets (default: 30)
 * @param symmetry - Exercise symmetry ('bilateral' or 'unilateral'). If unilateral, time is doubled.
 * @returns Total duration in seconds
 */
export function calculateExerciseDuration(
  reps: number,
  sets: number = 1,
  secondsPerRep: number = DEFAULT_SECONDS_PER_REP,
  restSeconds: number = DEFAULT_REST_SECONDS,
  symmetry?: 'bilateral' | 'unilateral'
): number {
  const workTime = reps * sets * secondsPerRep;
  const restTime = sets > 1 ? (sets - 1) * restSeconds : 0;
  const baseDuration = workTime + restTime;
  
  // If unilateral, double the total time (each side is done separately)
  return symmetry === 'unilateral' ? baseDuration * 2 : baseDuration;
}

/**
 * Calculate total workout duration including transitions
 * @param exerciseDurations - Array of exercise durations in seconds
 * @param transitionTime - Transition time between exercises (default: 10 seconds)
 * @returns Total duration in seconds
 */
export function calculateTotalWorkoutDuration(
  exerciseDurations: number[],
  transitionTime: number = TRANSITION_TIME_SECONDS
): number {
  if (exerciseDurations.length === 0) return 0;
  
  const totalExerciseTime = exerciseDurations.reduce((sum, duration) => sum + duration, 0);
  const totalTransitionTime = (exerciseDurations.length - 1) * transitionTime;
  
  return totalExerciseTime + totalTransitionTime;
}
