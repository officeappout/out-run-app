import type { WorkoutPlan } from '@/features/parks';

/**
 * isPureRecoveryVideoTrioWorkout — narrow discriminator for the rest-day
 * "recovery video trio" session (a rest-day workout that is exactly one
 * follow-along video), as opposed to every OTHER `isRecovery: true` producer.
 *
 * `WorkoutPlan.isRecovery === true` is set by THREE unrelated producers:
 *   1. The rest-day video trio — a single `seg-recovery` segment. THIS is
 *      the one this predicate targets.
 *   2. The "Budget Floor" cooldown workout — multi-exercise, isRecovery:true.
 *   3. The standard rest-day generator — a different shape entirely.
 *
 * Checking `isRecovery` alone would misclassify (2) and (3) as the video
 * trio. This predicate requires the EXACT single-segment `seg-recovery`
 * shape, so producers (2) and (3) always fall through as `false`.
 *
 * Usage:
 *   if (isPureRecoveryVideoTrioWorkout(stableWorkoutPlan)) { ... }
 */
export function isPureRecoveryVideoTrioWorkout(
  plan: WorkoutPlan | null | undefined,
): boolean {
  return (
    plan?.isRecovery === true &&
    plan?.segments?.length === 1 &&
    plan?.segments[0]?.id === 'seg-recovery'
  );
}
