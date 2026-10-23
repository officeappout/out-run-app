'use client';
/**
 * enable_location_gate_v1 (super-admin preview) — one read for the location switcher, the swap and the
 * poster-from-video fallback.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useLocationGateV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableLocationGateV1;
}
