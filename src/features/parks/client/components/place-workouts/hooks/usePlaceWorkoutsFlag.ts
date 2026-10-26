'use client';

/**
 * enable_place_workouts_v1 lives inside enable_home_v2 (the v2 park / route pages):
 * on only when both are. Off (or flags still loading) → the pages are unchanged.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export function isPlaceWorkoutsOn(flags: { enableHomeV2?: boolean; enablePlaceWorkoutsV1?: boolean }): boolean {
  return !!flags.enableHomeV2 && !!flags.enablePlaceWorkoutsV1;
}

export function usePlaceWorkoutsFlag(): boolean {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return isPlaceWorkoutsOn(useFeatureFlags(isSuperAdmin).flags);
}
