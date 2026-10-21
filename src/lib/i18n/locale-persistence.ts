/**
 * setUserLocale — the one writer of a user's language choice (PLAN §2.2).
 * Called by the language picker (wave 5A); nothing calls it while the flags are off.
 *
 * Writes, in order: the in-memory store, onboardingPrefs 'app_locale' (survives a
 * hard close, axioms §19), the out_locale cookie, and users/{uid}.core.locale (the
 * source of truth the server reads for pushes / Kelly). core.locale is an ordinary
 * owner-writable field: firestore.rules' noTenantFieldsChanged / noLockedCoreFieldsChanged
 * do not cover it, so no rules change is needed.
 */
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useAppStore } from '@/store/useAppStore';
import { writeLocaleCookie } from './locale-cookie';
import { LOCALE_PREF_KEY } from './locale-resolution';
import type { Locale } from './locales';

export async function setUserLocale(locale: Locale, uid?: string | null): Promise<void> {
  useLocaleStore.getState().setLocaleState({ locale });
  setOnboardingPref(LOCALE_PREF_KEY, locale);
  writeLocaleCookie(locale);
  // Keep the legacy he/en dictionary screens (challenge pages, old onboarding) in step.
  if (locale === 'he' || locale === 'en') useAppStore.getState().setLanguage(locale);
  if (uid) {
    await updateDoc(doc(db, 'users', uid), { 'core.locale': locale, updatedAt: serverTimestamp() });
  }
}
