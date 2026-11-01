'use client';

/**
 * useUnifiedPlayerV1 — the final canvas frame for every live situation (enable_unified_player_v1).
 * Rides on top of the run-player drawer pass, so it needs enable_home_v2 and
 * enable_run_player_drawer_v1 too. Super admins preview it.
 * False while the flags are still loading → the first paint is today's player.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useUnifiedPlayerV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableRunPlayerDrawerV1 && flags.enableUnifiedPlayerV1;
}
