'use client';

/**
 * useRunPlayerDrawerV1 — the run / walk players' "map first" pass
 * (enable_run_player_drawer_v1): metrics drawer, attached story-bar header,
 * solid live trail, drawer-aware follow camera. Lives inside the home-v2
 * players only, so it needs enable_home_v2 too. Super admins preview it.
 * False while the flags are still loading → the first paint is today's player.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useRunPlayerDrawerV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableRunPlayerDrawerV1;
}
