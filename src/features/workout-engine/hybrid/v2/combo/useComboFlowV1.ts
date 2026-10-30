'use client';
/**
 * enable_combo_flow_v1 (super-admin preview, canvas boards PlayerTransition* / PlayerCombo*): the
 * combined-workout flow on the hybrid v2 player. False while the flags load → today's player.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useComboFlowV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableComboFlowV1;
}
