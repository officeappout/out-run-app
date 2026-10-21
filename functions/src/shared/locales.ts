// AUTO-GENERATED from src/lib/i18n/locales.ts by functions/scripts/vendor-copy-geo-discovery.js — do not edit.
/**
 * The ONE locale type for the app (docs/i18n/PLAN.md §2.2).
 *
 * Hebrew is the source language: every catalog is written in Hebrew first,
 * every fallback chain ends in Hebrew, and with the i18n flags off the app is
 * always 'he'. The older language types (useAppStore, onboarding texts,
 * content LocalizedText) are aliases of the subsets below, so there is one
 * place to add a language.
 *
 * Plain data, no imports: safe for server code, tests and the functions mirror.
 */

export const LOCALES = ['he', 'en', 'ru', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** The source language. Catalogs are authored here; every fallback ends here. */
export const SOURCE_LOCALE: Locale = 'he';

/** Right-to-left locales (later: 'ar'). */
export const RTL_LOCALES: readonly Locale[] = ['he'];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/** `Intl` tag per locale (dates, numbers). 'he' keeps today's 'he-IL'. */
export const INTL_TAG: Record<Locale, string> = {
  he: 'he-IL',
  en: 'en',
  ru: 'ru',
  de: 'de',
};

/** Native name of each language, for the language picker (wave 5A). */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  he: 'עברית',
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
};

// ── Legacy subsets (kept so existing code compiles unchanged) ───────────────

/** useAppStore's language ('he' | 'en'): the old challenge-page toggle. */
export type LegacyStoreLanguage = Extract<Locale, 'he' | 'en'>;

/** src/lib/i18n/onboarding-locales.ts ('he' | 'en' | 'ru'). */
export type LegacyOnboardingLanguage = Extract<Locale, 'he' | 'en' | 'ru'>;

/**
 * Content LocalizedText ('he' | 'en' | 'es'). 'es' is a legacy content-only
 * slot (exercise docs), not an app locale.
 */
export type LegacyContentLanguage = Extract<Locale, 'he' | 'en'> | 'es';
