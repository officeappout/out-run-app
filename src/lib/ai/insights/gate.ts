/**
 * Is enable_workout_insights_v1 on for THIS user? Pure — the client (from useFeatureFlags'
 * rawFlags) and the server (getServerFeatureFlags, which never applies the super-admin
 * override itself) answer the same way: the stored flag, or its superAdminValue for a super
 * admin (preview while the flag is off).
 */
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const SUPER_ADMIN_VALUE = FLAG_DEFS.find((d) => d.key === 'enableWorkoutInsightsV1')?.superAdminValue === true;

export function workoutInsightsOnFor(
  flags: { enableWorkoutInsightsV1?: boolean } | null | undefined,
  isSuperAdmin: boolean | null | undefined,
): boolean {
  if (isSuperAdmin === true && SUPER_ADMIN_VALUE) return true;
  return flags?.enableWorkoutInsightsV1 === true;
}
