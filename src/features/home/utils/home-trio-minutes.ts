/**
 * The availableTime fed to generateHomeWorkoutTrio for the home hero workout. Pure
 * (__tests__/home-trio-minutes.test.ts).
 *
 * Late-night pivot wins (short 15). Otherwise the user's own length (lifestyle.sessionMinutes
 * with the first-weeks ramp). Users who never chose one keep the legacy 60-minute pool, which
 * the engine then trims per bolt (resolveEffectiveBoltTime: min(requested, 30/45/60)).
 */
import { plannedSessionMinutes, type PlannedMinutesProfile } from '@/features/schedule/goals/plannedSessionMinutes';

export const LEGACY_TRIO_MINUTES = 60;
export const LATE_NIGHT_TRIO_MINUTES = 15;

export function homeTrioAvailableMinutes(
  profile: PlannedMinutesProfile | null | undefined,
  now: Date,
  lateNight: boolean,
): number {
  if (lateNight) return LATE_NIGHT_TRIO_MINUTES;
  return plannedSessionMinutes(profile, now) ?? LEGACY_TRIO_MINUTES;
}
