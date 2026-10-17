'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_home_v2` for the onboarding screens (they live outside the /home
 * HomeV2Context, so they read the flag directly). Brand-new users have no
 * profile yet, so isSuperAdmin is false and the global Firestore value wins.
 */
export function useOnboardingV2(): boolean {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  return useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
}
