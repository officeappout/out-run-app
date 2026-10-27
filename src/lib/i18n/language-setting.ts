/**
 * Language setting (wave 5A) — pure helpers behind the Settings language row.
 * The row only exists when enable_i18n is on AND more than one locale is allowed,
 * so with the flag off nothing renders and nothing is written.
 */
import { allowedLocales, effectiveLocaleFlags, type LocaleFlags } from './locale-resolution';
import { LOCALE_NATIVE_NAME, type Locale } from './locales';

export interface LanguageOption {
  value: Locale;
  /** The language's own name (never translated). */
  name: string;
}

/** Choosable languages, Hebrew first. Empty while enable_i18n is off or only Hebrew is allowed. */
export function languageOptions(flags: LocaleFlags, isSuperAdmin: boolean): LanguageOption[] {
  if (!flags.enableI18n) return [];
  const allowed = allowedLocales(effectiveLocaleFlags(flags, isSuperAdmin));
  if (allowed.length < 2) return [];
  return allowed.map((value) => ({ value, name: LOCALE_NATIVE_NAME[value] }));
}
