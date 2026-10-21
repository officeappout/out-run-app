'use client';

/**
 * useWeekBuilderV1 — the two-level schedule UI (enable_week_builder_v1). Lives inside the
 * enable_home_v2 signup schedule flows only, so it needs enable_home_v2 too. Super admins
 * preview it. False while the flags load → the first paint is today's flow.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useWeekBuilderV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableWeekBuilderV1;
}
