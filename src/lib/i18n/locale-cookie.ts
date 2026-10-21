/**
 * The `out_locale` cookie — lets the server render <html lang dir> right on the
 * first paint (PLAN §2.2; the server read in src/app/layout.tsx is wave 4E).
 * Written by LocaleSync only while enable_i18n is on; removed when it is off,
 * so a Hebrew user never carries one.
 */
import { isLocale, type Locale } from './locales';

export const LOCALE_COOKIE = 'out_locale';
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** Locale from a Cookie header / document.cookie string, or null. */
export function parseLocaleCookie(cookieString: string | null | undefined): Locale | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join('='));
      return isLocale(value) ? value : null;
    }
  }
  return null;
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return;
  if (parseLocaleCookie(document.cookie) === locale) return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
}

export function clearLocaleCookie(): void {
  if (typeof document === 'undefined') return;
  if (!document.cookie.includes(`${LOCALE_COOKIE}=`)) return;
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
