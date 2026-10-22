'use client';
/**
 * enable_group_fixes_v1 (super-admin preview) — one read for every group /
 * together-training surface (join landings, invites, summary, booking, leave).
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useGroupFixesV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableGroupFixesV1;
}
