/**
 * The availableTime for the home carousel's full-strength build (resolveFullStrengthTrioOption).
 * Pure (__tests__/full-strength-minutes.test.ts).
 *
 * The drawer has no intensity pills any more (phone test 28.10, AA3), so the workout follows the
 * user's own session length: lifestyle.sessionMinutes with the first-weeks ramp, the same source
 * as the home hero (home-trio-minutes.ts, #883). Users who never chose one keep the context's
 * budget, so their workout is unchanged.
 */
import { plannedSessionMinutes, type PlannedMinutesProfile } from '@/features/schedule/goals/plannedSessionMinutes';

export function fullStrengthAvailableMinutes(
  profile: PlannedMinutesProfile | null | undefined,
  contextMinutes: number,
  now: Date,
): number {
  return plannedSessionMinutes(profile, now) ?? contextMinutes;
}
