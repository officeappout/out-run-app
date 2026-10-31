'use client';

/** enable_pilot_decisions_v1 (owner decisions 31.10.2026: M21 / M23 / M12). False while flags load. */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function usePilotDecisionsV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enablePilotDecisionsV1;
}
