/**
 * Is Kelly's builder mode on for THIS user? — enable_week_builder_v1 read the way the app reads
 * it (useWeekBuilderV1 → useFeatureFlags(isSuperAdmin)): the live system_config/feature_flags
 * value, or the flag's superAdminValue for a super admin. The chat route honours a request's
 * `builder` context only when this is true (and Kelly phase 2 is on). Pure.
 */
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const SUPER_ADMIN_VALUE = FLAG_DEFS.find((d) => d.key === 'enableWeekBuilderV1')?.superAdminValue === true;

export function weekBuilderFor(flags: { enableWeekBuilderV1?: boolean } | null | undefined, isSuperAdmin: boolean | null | undefined): boolean {
  if (isSuperAdmin === true) return SUPER_ADMIN_VALUE;
  return flags?.enableWeekBuilderV1 === true;
}
