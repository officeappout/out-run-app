'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * `enable_home_v2` for the onboarding screens (they live outside the /home
 * HomeV2Context, so they read the flag directly). Brand-new users have no
 * profile yet, so isSuperAdmin is false and the global Firestore value wins.
 *
 * `ready` is false while the flag is still unknown (a first visit on this
 * device: no cached flags, Firestore snapshot not in yet). Screens that
 * would otherwise paint the legacy look and swap to v2 a moment later
 * (the questionnaire flicker) hold their content until it's true.
 */
export function useOnboardingV2State(): { v2: boolean; ready: boolean; quizHintV2: boolean } {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return {
    v2: flags.enableHomeV2,
    ready: !loading,
    // enable_strength_quiz_hint_v2 — the strength quiz's self-demoing strip (VisualSlider, v2 only).
    quizHintV2: flags.enableStrengthQuizHintV2,
  };
}

export function useOnboardingV2(): boolean {
  return useOnboardingV2State().v2;
}
