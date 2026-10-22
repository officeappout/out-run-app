'use client';
/**
 * enable_swap_fixes_v1 (super-admin preview) — one read for every swap surface
 * (preview drawer, active player, hybrid overview, hybrid station, the modal).
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useSwapFixesV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableSwapFixesV1;
}
