/**
 * Is Kelly's workout-format request (ai_coach_workout_format) on for THIS user? The live
 * system_config/feature_flags value, or the flag's superAdminValue for a super admin (owner +
 * office always see it). Same shape as builder-gate.ts. Pure.
 */
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const SUPER_ADMIN_VALUE = FLAG_DEFS.find((d) => d.key === 'aiCoachWorkoutFormat')?.superAdminValue === true;

export function workoutFormatFor(flags: { aiCoachWorkoutFormat?: boolean } | null | undefined, isSuperAdmin: boolean | null | undefined): boolean {
  if (isSuperAdmin === true) return SUPER_ADMIN_VALUE;
  return flags?.aiCoachWorkoutFormat === true;
}
