'use client';
/**
 * enable_workout_post_v1 (super-admin preview, canvas boards PostTypes / PostCompact / PostFeed /
 * PostShare): one workout post card on home, in the feed and in the share images. False while the
 * flags load, so the first paint is today's card.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useWorkoutPostV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return !loading && flags.enableWorkoutPostV1;
}
