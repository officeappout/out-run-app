/**
 * The ONE config that decides which non-Hebrew locales the generic catalog validator and its test cover
 * (scripts/i18n/validate-catalog.ts, src/lib/i18n/__tests__/locale-catalogs-validate.test.ts).
 *
 * Adding a language = add the catalog files and ONE line here (scripts/i18n/add-locale-scaffold.ts does it).
 * Plain data, no imports.
 *
 *   status 'partial'   catalogs are being filled batch by batch: every key that exists must be valid, a missing key is fine.
 *   status 'complete'  every in-scope Hebrew key must exist (set it when the last batch lands, BEFORE flipping enable_locale_<xx>).
 *   allowNbsp          the language legitimately uses no-break spaces (French "?" rules, Russian number groups).
 */
export interface LocaleProfile {
  locale: string;
  status: 'partial' | 'complete';
  allowNbsp?: boolean;
}

export const LOCALE_PROFILES: readonly LocaleProfile[] = [
  { locale: 'en', status: 'complete' },
];
