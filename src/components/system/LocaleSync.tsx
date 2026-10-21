'use client';

/**
 * LocaleSync — resolves the app locale and keeps <html lang dir> in step
 * (docs/i18n/PLAN.md §2.2). Renders nothing. Replaces the old LanguageProvider
 * React Context (axioms §7); its <html> effect lives on here unchanged.
 *
 * enable_i18n OFF (default): locale stays 'he', the out_locale cookie is removed,
 * and <html lang dir> follow useAppStore exactly as LanguageProvider did — so
 * every user sees today's app byte for byte.
 * enable_i18n ON: locale = users/{uid}.core.locale → onboardingPrefs 'app_locale'
 * → device language → 'he', among the locales whose enable_locale_* flag is on.
 */
import { useEffect } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useAppStore } from '@/store/useAppStore';
import { useLocaleStore } from '@/store/useLocaleStore';
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { genderArg } from '@/lib/i18n/core/i18n-core';
import { clearLocaleCookie, writeLocaleCookie } from '@/lib/i18n/locale-cookie';
import {
  LOCALE_PREF_KEY,
  decideHtmlLangDir,
  deviceLocales,
  pickAppLocale,
} from '@/lib/i18n/locale-resolution';

export default function LocaleSync() {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const profileLocale = useUserStore((st) => (st.profile?.core as { locale?: unknown } | undefined)?.locale);
  const profileGender = useUserStore((st) => st.profile?.core?.gender);
  const { flags } = useFeatureFlags(isSuperAdmin);
  const { enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe } = flags;

  const legacyLanguage = useAppStore((s) => s.language);
  const legacyDirection = useAppStore((s) => s.direction);
  const locale = useLocaleStore((s) => s.locale);
  const i18nEnabled = useLocaleStore((s) => s.i18nEnabled);
  const setLocaleState = useLocaleStore((s) => s.setLocaleState);

  // The user's gender → the ICU `gender` value t() injects.
  useEffect(() => {
    setLocaleState({ gender: genderArg(profileGender) });
  }, [profileGender, setLocaleState]);

  // Resolve the locale.
  useEffect(() => {
    if (!enableI18n) {
      setLocaleState({ i18nEnabled: false, locale: 'he' });
      clearLocaleCookie();
      return;
    }
    let cancelled = false;
    const localeFlags = { enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe };
    void getOnboardingPrefAsync(LOCALE_PREF_KEY).then((storedLocale) => {
      if (cancelled) return;
      const next = pickAppLocale(localeFlags, { profileLocale, storedLocale, deviceLocales: deviceLocales() });
      setLocaleState({ i18nEnabled: true, locale: next });
      writeLocaleCookie(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe, profileLocale, setLocaleState]);

  // <html lang dir> — the old LanguageProvider effect, unchanged while i18n is off / Hebrew.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { lang, dir } = decideHtmlLangDir({ i18nEnabled, locale, legacyLanguage, legacyDirection });
    const html = document.documentElement;
    html.setAttribute('dir', dir);
    html.setAttribute('lang', lang);
  }, [i18nEnabled, locale, legacyLanguage, legacyDirection]);

  return null;
}
