'use client';
/**
 * enable_share_router_v1 (pilot AG2, super-admin preview): "share" on a workout summary opens the
 * three-option share sheet. False while the flags load → today's direct OS share.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useShareRouterV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableShareRouterV1;
}
