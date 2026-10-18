'use client';

/**
 * Whether to SHOW the "קלי AI" entry points (UI only — the server re-checks everything).
 * aiCoachEnabled && (aiCoachFreeForAll || entitlements/{uid}.aiCoach active) && adult.
 */
import { useUserStore } from '@/features/user';
import { useAiEntitlement } from '@/hooks/useAiEntitlement';

export function useAiCoachAccess(): { canUseAi: boolean; loading: boolean } {
  const { profile } = useUserStore();
  const { canUseAi, loading } = useAiEntitlement(profile?.id, profile?.core?.ageGroup === 'adult');
  return { canUseAi, loading };
}
