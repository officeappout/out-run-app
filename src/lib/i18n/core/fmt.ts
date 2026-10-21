/**
 * Numbers, dates and times per locale (docs/i18n/PLAN.md §2.5). Pure `Intl`.
 * For 'he' every function produces exactly what today's hard-coded 'he-IL'
 * calls produce, so wave 3 can swap `toLocale*('he-IL', …)` for these with no
 * visible change. No default time zone is added (same as toLocale*: the device's),
 * callers that pin Asia/Jerusalem keep passing it (PLAN decision 7). Units are
 * metric in every language (decision 6).
 */
import { INTL_TAG, type Locale } from '../locales';

const tag = (locale: Locale) => INTL_TAG[locale] ?? INTL_TAG.he;

export function formatNumber(value: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tag(locale), opts).format(value);
}

export function formatDate(date: Date | number, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(tag(locale), opts).format(date);
}

export function formatTime(date: Date | number, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(tag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(date);
}

/** "in 3 days", "לפני שעה". */
export function formatRelative(value: number, unit: Intl.RelativeTimeFormatUnit, locale: Locale, opts?: Intl.RelativeTimeFormatOptions): string {
  return new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto', ...opts }).format(value, unit);
}

/** Weekday name for 0 = Sunday … 6 = Saturday (the week logic itself stays Sunday-first). */
export function weekdayName(dayIndex: number, locale: Locale, width: 'long' | 'short' | 'narrow' = 'long'): string {
  // 2023-01-01 was a Sunday (UTC noon avoids any time-zone day shift).
  const d = new Date(Date.UTC(2023, 0, 1 + (((dayIndex % 7) + 7) % 7), 12));
  return new Intl.DateTimeFormat(tag(locale), { weekday: width, timeZone: 'UTC' }).format(d);
}

/** Kilometres with up to `digits` decimals ("5.2"). The unit word comes from the catalog. */
export function formatDistanceKm(km: number, locale: Locale, digits = 1): string {
  return formatNumber(km, locale, { maximumFractionDigits: digits });
}
