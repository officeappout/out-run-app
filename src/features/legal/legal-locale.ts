/**
 * Which language the server-rendered legal pages (/privacy, /delete-data, /accessibility) use. Pure.
 *
 * Request: `?lang=` (store listings / external links can ask for English) wins over the out_locale cookie
 * (written by LocaleSync while enable_i18n is on, so in-app links carry the user's language with no param).
 * Gate: the STORED flags only (enable_i18n + that language's enable_locale_*), never the super-admin override.
 * No param, no cookie, a Hebrew request or flags off → Hebrew, exactly as before.
 */
import { allowedLocales, type LocaleFlags } from '@/lib/i18n/locale-resolution';
import { dirOf, isLocale, SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';

/** The language the request asks for (param, then cookie), or null. */
export function requestedLegalLocale(langParam: unknown, cookieLocale: Locale | null): Locale | null {
  const param = Array.isArray(langParam) ? langParam[0] : langParam;
  if (typeof param === 'string' && isLocale(param)) return param;
  return cookieLocale;
}

/** The requested language if the stored flags allow it, else Hebrew. */
export function pickLegalLocale(requested: Locale | null, flags: LocaleFlags | null): Locale {
  if (!requested || requested === SOURCE_LOCALE || !flags) return SOURCE_LOCALE;
  return allowedLocales(flags).includes(requested) ? requested : SOURCE_LOCALE;
}

/** <div dir lang> host of a legal page. */
export function legalHostAttrs(locale: Locale): { dir: 'rtl' | 'ltr'; lang: Locale } {
  return { dir: dirOf(locale), lang: locale };
}
