'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_entry_globe_v1` — the entry flow's new location-step presentation
 * (live Earth → dive → "גרים ב…?" → grouped search). Same read pattern as
 * useOnboardingV2: brand-new users have no profile yet, so isSuperAdmin is
 * false and the global Firestore value wins; a super admin always previews it.
 */
export function useEntryGlobeV1(): boolean {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags } = useFeatureFlags(isSuperAdmin);
  return flags.enableEntryGlobeV1;
}
