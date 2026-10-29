'use client';

/**
 * useFeatureInfoSheetsV1 — enable_feature_info_sheets_v1: the "i" next to a feature's title
 * (where to train, the week schedule, a route with stops, the strength preview) that explains
 * it. Super admins preview it. False while the flags are still loading → no "i", today's screens.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useFeatureInfoSheetsV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableFeatureInfoSheetsV1;
}
