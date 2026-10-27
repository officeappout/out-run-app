'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useLocaleStore } from '@/store/useLocaleStore';
import { shouldShowHeOnlySteps } from '../utils/he-only-steps';

/**
 * Whether onboarding shows the Hebrew-only steps (persona). Flag off or locale 'he' → true,
 * i.e. unchanged. The rule itself is utils/he-only-steps.ts.
 */
export function useShowHeOnlySteps(): boolean {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags } = useFeatureFlags(isSuperAdmin);
  const locale = useLocaleStore((s) => s.locale);
  return shouldShowHeOnlySteps({ locale, flagOn: !!flags.hideHeOnlyOnboardingSteps });
}
