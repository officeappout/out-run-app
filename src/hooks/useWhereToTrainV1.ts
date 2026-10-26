'use client';
/**
 * enable_where_to_train_v1 (super-admin preview) — one read for the workout preview's
 * "איפה מתאמנים?" section and the shared "I'm training here" sheet.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useWhereToTrainV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  return useFeatureFlags(isSuperAdmin).flags.enableWhereToTrainV1;
}
