'use client';

/**
 * useMapSurfaceFilterV1 — enable_map_surface_filter_v1 (surface filter in the map layers
 * panel). Fail-closed: false while the flags load, and super admins get no preview
 * (superAdminValue false) — off = today's map, byte-identical.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function useMapSurfaceFilterV1(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && !!flags.enableMapSurfaceFilterV1;
}
