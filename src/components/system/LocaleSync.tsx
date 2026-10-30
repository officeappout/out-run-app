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
 * → device language (new users only, see isNewUserForLocale) → 'he', among the locales whose enable_locale_* flag is on.
 */
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { usePathname } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/lib/firebase';
import { useLocaleStore } from '@/store/useLocaleStore';
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { ONBOARDING_GENDER_EVENT, readOnboardingGender, resolveUiGender } from '@/lib/i18n/gender-copy';
import { setUserLocale } from '@/lib/i18n/locale-persistence';
import { clearLocaleCookie, writeLocaleCookie } from '@/lib/i18n/locale-cookie';
import {
  LOCALE_PREF_KEY,
  decideHtmlLangDir,
  deviceLocales,
  deviceLocalesFor,
  effectiveLocaleFlags,
  deviceDetectAllowed,
  pickAppLocale,
} from '@/lib/i18n/locale-resolution';

export default function LocaleSync() {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const profileLocale = useUserStore((st) => (st.profile?.core as { locale?: unknown } | undefined)?.locale);
  const profileId = useUserStore((st) => st.profile?.id);
  const hasProfile = useUserStore((st) => !!st.profile);
  const hydrated = useUserStore((st) => st._hasHydrated);
  const profileStatus = useUserStore((st) => (st.profile?.core as { onboardingStatus?: unknown } | undefined)?.onboardingStatus ?? (st.profile as { onboardingStatus?: unknown } | null)?.onboardingStatus);
  const profileCreatedAt = useUserStore((st) => (st.profile as { createdAt?: unknown } | null)?.createdAt);
  const profileGender = useUserStore((st) => st.profile?.core?.gender);
  const { flags } = useFeatureFlags(isSuperAdmin);
  const { enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe, enableContentLocale } = flags;

  const legacyLanguage = useAppStore((s) => s.language);
  const legacyDirection = useAppStore((s) => s.direction);
  const locale = useLocaleStore((s) => s.locale);
  const i18nEnabled = useLocaleStore((s) => s.i18nEnabled);
  const setLocaleState = useLocaleStore((s) => s.setLocaleState);

  // The user's gender → the ICU `gender` value t() injects (and useUiGender() returns).
  // Before the profile holds one (onboarding), the gender picked on the identity screen,
  // which lives in sessionStorage: re-read on every route change (the identity screen
  // navigates right after writing it) and on ONBOARDING_GENDER_EVENT.
  // Firebase restores the session asynchronously: until its first callback, "no auth user" means "unknown".
  const [authResolved, setAuthResolved] = useState(false);
  useEffect(() => {
    if (!auth) { setAuthResolved(true); return; }
    try {
      return onAuthStateChanged(auth, () => setAuthResolved(true));
    } catch {
      setAuthResolved(true); // no usable auth (tests / SSR shells): nothing to wait for
    }
  }, []);

  const pathname = usePathname();
  const [onboardingGender, setOnboardingGender] = useState<string | null>(null);
  useEffect(() => {
    setOnboardingGender(readOnboardingGender());
  }, [pathname]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setOnboardingGender(readOnboardingGender());
    window.addEventListener(ONBOARDING_GENDER_EVENT, onChange);
    return () => window.removeEventListener(ONBOARDING_GENDER_EVENT, onChange);
  }, []);
  useEffect(() => {
    setLocaleState({ gender: resolveUiGender(profileGender, onboardingGender) });
  }, [profileGender, onboardingGender, setLocaleState]);

  // Content (exercise names etc.) resolves in English only with enable_i18n AND enable_content_locale.
  useEffect(() => {
    setLocaleState({ contentLocaleOn: !!enableI18n && !!enableContentLocale });
  }, [enableI18n, enableContentLocale, setLocaleState]);

  // Resolve the locale.
  useEffect(() => {
    if (!enableI18n) {
      setLocaleState({ i18nEnabled: false, locale: 'he' });
      clearLocaleCookie();
      return;
    }
    let cancelled = false;
    const localeFlags = effectiveLocaleFlags({ enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe }, isSuperAdmin);
    void getOnboardingPrefAsync(LOCALE_PREF_KEY).then((storedLocale) => {
      if (cancelled) return;
      const detect = deviceDetectAllowed({
        profile: hasProfile ? { createdAt: profileCreatedAt, onboardingStatus: profileStatus } : null,
        hydrated,
        hasAuthUser: !!auth?.currentUser,
        authResolved,
      });
      // Profile still on its way for a signed-in / not-yet-hydrated user: no device guess, no SSR cookie.
      const settling = !hasProfile && (!hydrated || !authResolved || !!auth?.currentUser);
      const next = pickAppLocale(localeFlags, {
        profileLocale,
        storedLocale,
        deviceLocales: deviceLocalesFor(deviceLocales(), { enableLocaleEn }),
        detectDevice: detect,
      });
      setLocaleState({ i18nEnabled: true, locale: next });
      if (!settling) writeLocaleCookie(next);
      // A signed-in user whose English came from the device (new user) or the pre-signup pill has no
      // core.locale yet: persist it so pushes / Kelly (which read core.locale only) agree. Hebrew is never written.
      const hasStoredCore = typeof profileLocale === 'string' && profileLocale !== '';
      if (next !== 'he' && profileId && hasProfile && !hasStoredCore) {
        void setUserLocale(next, profileId).catch(() => {});
      }
      // The legacy he/en dictionary screens (useLanguage / useTranslation: strength live overlay, challenge
      // pages, old onboarding) read useAppStore.language. Only the explicit picker used to sync it, so an
      // English locale resolved from the device left them Hebrew. Runs only with enable_i18n on.
      if (next === 'he' || next === 'en') useAppStore.getState().setLanguage(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enableI18n, enableLocaleEn, enableLocaleRu, enableLocaleDe, isSuperAdmin, profileLocale, profileId, hasProfile, profileCreatedAt, profileStatus, hydrated, authResolved, setLocaleState]);

  // <html lang dir> — the old LanguageProvider effect, unchanged while i18n is off / Hebrew.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const legacyToggleScreen = !!pathname?.startsWith('/challenge');
    const { lang, dir } = decideHtmlLangDir({ i18nEnabled, locale, legacyLanguage, legacyDirection, legacyToggleScreen });
    const html = document.documentElement;
    html.setAttribute('dir', dir);
    html.setAttribute('lang', lang);
  }, [i18nEnabled, locale, legacyLanguage, legacyDirection, pathname]);

  return null;
}
