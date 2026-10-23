'use client';

/**
 * useWidePlayerV1 — enable_wide_player_v1: the strength / timed players get a
 * side-by-side layout on wide containers. Lives inside the home-v2 players, so
 * it needs enable_home_v2 too. Super admins preview it. False while the flags
 * are still loading → today's player.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useWidePlayerV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableWidePlayerV1;
}
