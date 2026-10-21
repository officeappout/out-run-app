/**
 * useLocaleStore — the app's current locale (docs/i18n/PLAN.md §2.1-2.2).
 * Zustand, no React Context (axioms §7). Written only by LocaleSync
 * (src/components/system/LocaleSync.tsx) and setUserLocale
 * (src/lib/i18n/locale-persistence.ts); read by useT().
 *
 * Not persisted here on purpose: durability lives in users/{uid}.core.locale and
 * onboardingPrefs 'app_locale' (axioms §19), resolved again on every launch.
 * Starts as 'he', so with the flags off nothing ever changes.
 */
import { create } from 'zustand';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import { onCatalogLoaded } from '@/lib/i18n/catalogs';
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';

interface LocaleState {
  locale: Locale;
  /** enable_i18n as last seen by LocaleSync (false = Hebrew only). */
  i18nEnabled: boolean;
  /** The signed-in user's gender, injected into t() as the ICU `gender` value. */
  gender: Gender;
  /** Bumped whenever a lazy catalog lands, so useT() re-renders with it. */
  catalogVersion: number;
  setLocaleState: (next: Partial<Pick<LocaleState, 'locale' | 'i18nEnabled' | 'gender'>>) => void;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: SOURCE_LOCALE,
  i18nEnabled: false,
  gender: 'other',
  catalogVersion: 0,
  setLocaleState: (next) => set(next),
}));

onCatalogLoaded(() => useLocaleStore.setState((s) => ({ catalogVersion: s.catalogVersion + 1 })));
