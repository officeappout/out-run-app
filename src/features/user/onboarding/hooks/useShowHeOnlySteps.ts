'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useLocaleStore } from '@/store/useLocaleStore';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { LOCALE_PREF_KEY } from '@/lib/i18n/locale-resolution';
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
  /** onboardingPrefs 'onboarding_language' (the wizard's own choice). */
  pref: string | null | undefined;
  /** onboardingPrefs 'app_locale' (the persisted app locale; LocaleSync's "stored" source). */
  storedPref?: string | null;
  flagsLoading: boolean;
  flagOn: boolean;
  /** enable_i18n, and whether LocaleSync has resolved the store yet (store.i18nEnabled). */
  i18nFlagOn?: boolean;
  storeResolved?: boolean;
}): { show: boolean; ready: boolean } {
  const locale = resolveOnboardingUiLocale(resolveOnboardingUiLocale(input.storeLocale, input.storedPref), input.pref);
  if (locale === SOURCE_LOCALE) {
    // Store still on its default 'he' before LocaleSync ran, i18n is on, and nothing says Hebrew: the real
    // locale may be English (device). Hold. An explicit Hebrew pref, or i18n off, never waits.
    const explicitHe = input.pref === SOURCE_LOCALE || input.storedPref === SOURCE_LOCALE;
    if (!input.flagsLoading && input.flagOn && input.i18nFlagOn && !input.storeResolved && !explicitHe) return { show: false, ready: false };
    return { show: true, ready: true };
  }
  if (input.flagsLoading) return { show: false, ready: false };
  return { show: shouldShowHeOnlySteps({ locale, flagOn: input.flagOn }), ready: true };
}

export function useHeOnlyStepsState(): { show: boolean; ready: boolean } {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  const storeLocale = useLocaleStore((s) => s.locale);
  const storeResolved = useLocaleStore((s) => s.i18nEnabled);
  return computeHeOnlyState({
    storeLocale,
    pref: getOnboardingPref('onboarding_language'),
    storedPref: getOnboardingPref(LOCALE_PREF_KEY),
    flagsLoading: loading,
    flagOn: !!flags.hideHeOnlyOnboardingSteps,
    i18nFlagOn: !!flags.enableI18n,
    storeResolved,
  });
}

export function useShowHeOnlySteps(): boolean {
  return useHeOnlyStepsState().show;
}
