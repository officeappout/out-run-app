/**
 * "Last updated" dates of the legal pages. Hebrew keeps the exact strings the pages always showed;
 * other locales format the same dates with Intl.
 */
import { INTL_TAG, SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';
import { LEGAL_LAST_UPDATED_HE } from './legal-content';

/** Bump on every material change to the accessibility statement or to the real conformance status. */
const ACCESSIBILITY_LAST_UPDATED_HE = '27 באוקטובר 2026'; // i18n-allow-hebrew: date text — Hebrew stays byte-identical
const ACCESSIBILITY_LAST_UPDATED = Date.UTC(2026, 9, 27);
/** The month LEGAL_LAST_UPDATED_HE names. */
const LEGAL_LAST_UPDATED = Date.UTC(2026, 9, 1);

const fmt = (locale: Locale, ms: number, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(INTL_TAG[locale], { ...opts, timeZone: 'UTC' }).format(ms);

/** Privacy policy / terms "updated" month. */
export function legalLastUpdated(locale: Locale): string {
  return locale === SOURCE_LOCALE ? LEGAL_LAST_UPDATED_HE : fmt(locale, LEGAL_LAST_UPDATED, { month: 'long', year: 'numeric' });
}

/** Accessibility statement "last updated" day. */
export function accessibilityLastUpdated(locale: Locale): string {
  return locale === SOURCE_LOCALE
    ? ACCESSIBILITY_LAST_UPDATED_HE
    : fmt(locale, ACCESSIBILITY_LAST_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' });
}
