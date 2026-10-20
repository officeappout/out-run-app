/**
 * Is the running week placed by slot type for THIS user? — enable_home_v2, read the way
 * home reads it: `useFeatureFlags(isSuperAdmin).flags.enableHomeV2`, i.e. the live
 * system_config/feature_flags value, or the flag's superAdminValue for a super admin.
 *
 * Pure (no Firebase): the client (Kelly's chat, from useFeatureFlags' rawFlags) and the
 * server (Kelly's advisor, from getServerFeatureFlags — which never applies the
 * super-admin override itself) both call this, so Kelly / the advisor show the same run
 * week as home for the same user.
 */
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const HOME_V2_SUPER_ADMIN_VALUE = FLAG_DEFS.find((d) => d.key === 'enableHomeV2')?.superAdminValue === true;

export function runsByTypeFor(
  flags: { enableHomeV2?: boolean } | null | undefined,
  isSuperAdmin: boolean | null | undefined,
): boolean {
  if (isSuperAdmin === true) return HOME_V2_SUPER_ADMIN_VALUE;
  return flags?.enableHomeV2 === true;
}
