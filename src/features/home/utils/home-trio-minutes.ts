/**
 * The availableTime fed to generateHomeWorkoutTrio for the home hero workout. Pure
 * (__tests__/home-trio-minutes.test.ts).
 *
 * Late-night pivot wins (short 15). Otherwise the user's own length (lifestyle.sessionMinutes
 * with the first-weeks ramp). Users who never chose one get a level-based default
 * (defaultSessionMinutesForLevel); the engine honours the requested minutes as is.
 */
import { plannedSessionMinutes, rampInputOf, type PlannedMinutesProfile } from '@/features/schedule/goals/plannedSessionMinutes';

/**
 * Default length for a user who never chose one. It used to be a flat 60 that the
 * per-bolt ceilings trimmed (the hero got 45); the ceilings are gone, so the default
 * itself grows with the level: short for beginners, ~50 for advanced.
 */
export function defaultSessionMinutesForLevel(level: number): number {
  if (level <= 2) return 20;
  if (level <= 5) return 30;
  if (level <= 9) return 40;
  if (level <= 14) return 45;
  return 50;
}
export const LATE_NIGHT_TRIO_MINUTES = 15;

export function homeTrioAvailableMinutes(
  profile: PlannedMinutesProfile | null | undefined,
  now: Date,
  lateNight: boolean,
): number {
  if (lateNight) return LATE_NIGHT_TRIO_MINUTES;
  return plannedSessionMinutes(profile, now) ?? defaultSessionMinutesForLevel(rampInputOf(profile, now).level);
}
