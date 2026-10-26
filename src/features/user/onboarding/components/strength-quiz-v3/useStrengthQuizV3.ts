'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { isStrengthQuizV3Entry } from './quiz-v3-entry';

/** enable_strength_quiz_v3 for the strength signup entry (super admins preview it). */
export function useStrengthQuizV3Entry(): boolean {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, ready } = useFeatureFlags(isSuperAdmin);
  return isStrengthQuizV3Entry({
    flagOn: flags.enableStrengthQuizV3,
    flagsReady: ready,
    gatewayTrack: getOnboardingPref('gateway_track'),
  });
}
