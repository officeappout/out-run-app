'use client';

/**
 * useTogetherLayerV1 — enable_together_layer_v1: presence rail, lobby
 * explanation + synced countdown, race bar, cheers, richer summary. Lives in
 * the home-v2 players / lobby, so it needs enable_home_v2 too. Super admins
 * preview it. False while the flags load → the first paint is today's screen.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useTogetherLayerV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableHomeV2 && flags.enableTogetherLayerV1;
}
