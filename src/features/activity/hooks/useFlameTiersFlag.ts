'use client';

/** enable_flame_tiers_v1 for components (super admins preview it). Off / loading ⇒ false. */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useFlameTiersFlag(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return !!useFeatureFlags(isSuperAdmin).flags.enableFlameTiersV1;
}
