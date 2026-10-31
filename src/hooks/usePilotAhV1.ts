'use client';

/** enable_pilot_ah_v1 (owner iPhone 14 Plus notes, 31.10.2026, section AH). False while flags load. */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function usePilotAhV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enablePilotAhV1;
}
