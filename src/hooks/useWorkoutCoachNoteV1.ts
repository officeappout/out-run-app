'use client';
/**
 * enable_workout_coach_note_v1 (super-admin preview): the "דגשי האימון" coach note on the workout
 * overview / preview drawer (CoachNoteBlock). Before this the note sat behind the compile-time
 * WORKOUT_COACH_NOTE_V1 constant only, so it never reached a phone (phone test AB2). Either one on
 * turns it on.
 */
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { WORKOUT_COACH_NOTE_V1 } from '@/config/feature-flags';

export function useWorkoutCoachNoteV1(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return WORKOUT_COACH_NOTE_V1 || (!loading && flags.enableWorkoutCoachNoteV1);
}
