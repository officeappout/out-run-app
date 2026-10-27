'use client';

/**
 * useScheduleTutorialV1: the schedule tutorial (ל1 to ל5, enable_schedule_tutorial_v1). Lives on the
 * v2 home only, so it needs enable_home_v2 too. Super admins preview it. False while the flags load,
 * so the first paint is today's home.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useScheduleTutorialV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableScheduleTutorialV1;
}
