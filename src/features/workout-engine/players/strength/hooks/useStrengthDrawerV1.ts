'use client';

/**
 * useStrengthDrawerV1 — enable_strength_drawer_v1: the strength / tabata /
 * AMRAP / EMOM bottom card as a two-snap drawer, the "הסבר" chip at the
 * video's top corner, and exercise details in the session list. Lives inside
 * the home-v2 players only, so it needs enable_home_v2 too. Super admins
 * preview it. False while the flags are still loading → today's player.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useStrengthDrawerV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableStrengthDrawerV1;
}
