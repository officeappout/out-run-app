/**
 * Display helpers on top of `core/fmt.ts` for call sites that used to call
 * `date.toLocaleDateString('he-IL', …)` directly (i18n wave 3A, docs/i18n/PLAN.md §2.5).
 *
 * Not part of `core/` on purpose: core is import-free because it is mirrored to Cloud Functions;
 * this file only adds the one behaviour `Intl.DateTimeFormat` does not share with `toLocaleDateString`.
 */
import { formatDate } from './core/fmt';
import type { Locale } from './locales';

/**
 * Same text as `date.toLocaleDateString(<tag of locale>, opts)` for every input, including an invalid
 * date: `toLocaleDateString` answers 'Invalid Date', `Intl.DateTimeFormat#format` throws a RangeError.
 * Use it where the date comes from data (Firestore, strings) and was never validated; where the call
 * site already guards with `isNaN(d.getTime())`, call `formatDate` from `core/fmt` directly.
 */
export function formatDateLoose(date: Date, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return formatDate(date, locale, opts);
}

/** Month name for a 0-based month index (any integer wraps): 'long' = "אוקטובר", 'short' = "אוק׳". */
export function monthLabel(monthIndex: number, locale: Locale, width: 'long' | 'short' | 'narrow' = 'long'): string {
  // Mid-month at UTC noon: no day or time-zone shift can change the month.
  const d = new Date(Date.UTC(2023, ((monthIndex % 12) + 12) % 12, 15, 12));
  return formatDate(d, locale, { month: width, timeZone: 'UTC' });
}
