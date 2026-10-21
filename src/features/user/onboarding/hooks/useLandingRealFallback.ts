'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_landing_real_fallback` — retire /gateway as the fallback (gateway-retire-brief.md).
 * Same read pattern as useEntryIntroV1 (the global Firestore value; the flag's superAdminValue
 * is false, so a super admin sees the panel value too). Starts from the device's cached flags;
 * `loading` is true only while nothing is known — mount-time redirects wait for it, so a
 * device that knows the flag is on never hops through /gateway first.
 */
export function useLandingRealFallback(): { enabled: boolean; loading: boolean } {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return { enabled: flags.enableLandingRealFallback, loading };
}
