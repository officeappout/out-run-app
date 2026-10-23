'use client';
/**
 * enable_overview_more_menu_v1 (super-admin preview) — the workout overview's action icons collapse into one ⋯ menu.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useOverviewMoreMenuV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableOverviewMoreMenuV1;
}
