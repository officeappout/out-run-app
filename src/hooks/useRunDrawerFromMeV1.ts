'use client';
/**
 * enable_run_drawer_from_me_v1 (super-admin preview, board RP-14) — the run overview's drawer starts
 * from the runner's location: a row of route tiles (loops from here + a near, fitting official route).
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useRunDrawerFromMeV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableRunDrawerFromMeV1;
}
