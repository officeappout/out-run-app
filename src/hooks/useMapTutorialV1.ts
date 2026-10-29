'use client';
/**
 * enable_map_tutorial_v1 (super-admin preview, canvas boards M1-M8): the first-run map tutorial.
 * False while the flags load, so the first paint is today's map.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useMapTutorialV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableMapTutorialV1;
}
