'use client';

/**
 * enable_progress_hub_v2 lives inside enable_home_v2: the hub is on only when
 * both are. `ready` is false until the flags are known (callers show a neutral
 * skeleton, never one layout and then the other).
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function isProgressHubOn(flags: { enableHomeV2?: boolean; enableProgressHubV2?: boolean }): boolean {
  return !!flags.enableHomeV2 && !!flags.enableProgressHubV2;
}

export function useProgressHubFlag(): { ready: boolean; on: boolean } {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, ready } = useFeatureFlags(isSuperAdmin);
  return { ready, on: isProgressHubOn(flags) };
}
