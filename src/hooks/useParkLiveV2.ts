'use client';
/**
 * enable_park_live_v2 (super-admin preview, canvas boards Park 1-12): the live park workout
 * (walk + equipment stations). False while the flags load, so the first paint is today's player.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useParkLiveV2(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableParkLiveV2;
}
