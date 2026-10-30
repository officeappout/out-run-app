'use client';
/**
 * enable_workout_tutorial_v1 (pilot S2): the strength workout tutorial (overview bubbles, player
 * phase cards, equipment sheet, first-input bubble). False while the flags load.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useWorkoutTutorialV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableWorkoutTutorialV1;
}
