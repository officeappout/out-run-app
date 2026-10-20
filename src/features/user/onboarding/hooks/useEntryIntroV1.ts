'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_entry_intro_v1` — the new landing, the 5-barrier intro stories and the
 * ring that closes into the globe. Same read pattern as useEntryGlobeV1: the
 * landing is pre-auth (no profile, isSuperAdmin false), so the global Firestore
 * value decides there; a signed-in super admin always previews it.
 *
 * `loading` is true only until this device has ever known the flags (the hook
 * starts from the last-known cached values), so the landing can keep its splash
 * up instead of painting the wrong design first.
 */
export function useEntryIntroV1(): { enabled: boolean; loading: boolean } {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return { enabled: flags.enableEntryIntroV1, loading };
}
