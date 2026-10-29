'use client';

/**
 * useMethodInfoSheetV1 — enable_method_info_sheet_v1: the "i" next to a
 * strength block's title that explains the method. Super admins preview it.
 * False while the flags are still loading → no "i", today's screens.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useMethodInfoSheetV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableMethodInfoSheetV1;
}
