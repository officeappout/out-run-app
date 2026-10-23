'use client';
/**
 * enable_hill_finder_v1 (super-admin preview) — the run overview names the nearest suitable hill
 * when today's hill workout has no suggested route with a climb that meets the rep spec.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useHillFinderV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableHillFinderV1;
}
