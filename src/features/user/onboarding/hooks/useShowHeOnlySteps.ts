'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useLocaleStore } from '@/store/useLocaleStore';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { shouldShowHeOnlySteps } from '../utils/he-only-steps';

/**
 * The language onboarding is shown in: the wizard's own choice (onboardingPrefs 'onboarding_language',
 * the same read OnboardingWizard uses) when it is not Hebrew, else the app locale (LocaleSync).
 */
export function resolveOnboardingUiLocale(storeLocale: string, pref: string | null | undefined): string {
  return pref && pref !== SOURCE_LOCALE ? pref : storeLocale;
}

/**
 * Whether onboarding shows the Hebrew-only steps (persona). `ready` is false only while the locale is
 * not Hebrew and the flags are still unknown: callers hold the persona step until then. Hebrew never waits.
 * The rule itself is utils/he-only-steps.ts.
 */
export function computeHeOnlyState(input: {
  storeLocale: string;
  pref: string | null | undefined;
  flagsLoading: boolean;
  flagOn: boolean;
}): { show: boolean; ready: boolean } {
  const locale = resolveOnboardingUiLocale(input.storeLocale, input.pref);
  if (locale === SOURCE_LOCALE) return { show: true, ready: true };
  if (input.flagsLoading) return { show: false, ready: false };
  return { show: shouldShowHeOnlySteps({ locale, flagOn: input.flagOn }), ready: true };
}

export function useHeOnlyStepsState(): { show: boolean; ready: boolean } {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  const storeLocale = useLocaleStore((s) => s.locale);
  return computeHeOnlyState({
    storeLocale,
    pref: getOnboardingPref('onboarding_language'),
    flagsLoading: loading,
    flagOn: !!flags.hideHeOnlyOnboardingSteps,
  });
}

export function useShowHeOnlySteps(): boolean {
  return useHeOnlyStepsState().show;
}
