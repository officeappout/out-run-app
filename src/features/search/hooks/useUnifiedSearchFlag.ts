'use client';

/** enable_unified_search for the signed-in user (super admins preview it). */
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

export function useUnifiedSearchFlag(): { on: boolean; loading: boolean } {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return { on: flags.enableUnifiedSearch === true, loading };
}
