'use client';

/**
 * useMapPolishV1 — enable_map_polish_v1 (one navigation, compact park card,
 * v2 route details, parks / routes layer toggles). Lives inside the home-v2
 * map only, so it needs enable_home_v2 too. Super admins preview it.
 * False while the flags are still loading → the first paint is today's map.
 */

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useMapPolishV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableMapPolishV1;
}
