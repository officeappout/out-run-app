/**
 * Which locale the app shows, and what <html lang dir> becomes (PLAN §2.2).
 * Pure; LocaleSync feeds it the flags, the profile, the stored pref and the device.
 */
import { resolveLocale } from './core/i18n-core';
import { dirOf, isLocale, SOURCE_LOCALE, type LegacyStoreLanguage, type Locale } from './locales';

/** The enable_* flags that gate i18n (FeatureFlags keys). */
export interface LocaleFlags {
  enableI18n: boolean;
  enableLocaleEn: boolean;
  enableLocaleRu: boolean;
  enableLocaleDe: boolean;
}

/** onboardingPrefs key holding the user's chosen locale (axioms §19). */
export const LOCALE_PREF_KEY = 'app_locale';

/** Locales the flags allow. Hebrew always; nothing else while enable_i18n is off. */
export function allowedLocales(flags: LocaleFlags): Locale[] {
  if (!flags.enableI18n) return [SOURCE_LOCALE];
  const out: Locale[] = [SOURCE_LOCALE];
  if (flags.enableLocaleEn) out.push('en');
  if (flags.enableLocaleRu) out.push('ru');
  if (flags.enableLocaleDe) out.push('de');
  return out;
}

export interface LocaleSources {
  profileLocale?: unknown;
  storedLocale?: unknown;
  deviceLocales?: readonly string[];
}

/** Profile → stored pref → device → 'he', among the allowed locales. Flags off → 'he'. */
export function pickAppLocale(flags: LocaleFlags, sources: LocaleSources): Locale {
  const loc = resolveLocale({ i18nEnabled: flags.enableI18n, allowed: allowedLocales(flags), ...sources });
  return isLocale(loc) ? loc : SOURCE_LOCALE;
}

/**
 * <html lang dir>. While i18n is off, or the locale is Hebrew, this is exactly what
 * the old LanguageProvider set (useAppStore's language/direction, which the
 * challenge pages' he/en toggle still drives) — byte-identical for every user today.
 */
export function decideHtmlLangDir(input: {
  i18nEnabled: boolean;
  locale: Locale;
  legacyLanguage: LegacyStoreLanguage;
  legacyDirection: 'rtl' | 'ltr';
}): { lang: string; dir: 'rtl' | 'ltr' } {
  if (!input.i18nEnabled || input.locale === SOURCE_LOCALE) {
    return { lang: input.legacyLanguage, dir: input.legacyDirection };
  }
  return { lang: input.locale, dir: dirOf(input.locale) };
}

/** Device languages (navigator.languages; WKWebView reports the iOS language). */
export function deviceLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  return list.filter((x): x is string => typeof x === 'string');
}
