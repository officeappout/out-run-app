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

/**
 * Month name for 0 = January … 11 = December (the index `Date#getMonth()` returns).
 * 'he' long = ינואר … דצמבר, short = ינו׳ … דצמ׳ (what the hand-written arrays held).
 */
export function monthName(monthIndex: number, locale: Locale, width: 'long' | 'short' | 'narrow' = 'long'): string {
  // Mid-month at UTC noon: no time-zone shift can move it to another month.
  const d = new Date(Date.UTC(2023, ((monthIndex % 12) + 12) % 12, 15, 12));
  return new Intl.DateTimeFormat(tag(locale), { month: width, timeZone: 'UTC' }).format(d);
}

/**
 * "15 מרץ" — day number + month name, no preposition. This is the Hebrew shape the
 * home agenda has always shown (the Intl 'he' day+month form would say "15 במרץ").
 * Other languages use their own Intl day+month form ("15 March", "15. März", "15 марта").
 * Reads the date in the device's time zone, like `getDate()`/`getMonth()` did.
 */
export function formatDayMonth(date: Date, locale: Locale): string {
  if (locale === 'he') return `${date.getDate()} ${monthName(date.getMonth(), locale)}`;
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'long' }).format(date);
}

/**
 * A week/date range label. 'he' keeps the planner's text: "7–13 מרץ" inside one month,
 * "28 פברואר — 6 מרץ" across two. Other languages use `Intl.DateTimeFormat#formatRange`.
 */
export function formatDateRange(start: Date, end: Date, locale: Locale): string {
  if (locale === 'he') {
    const startMonth = monthName(start.getMonth(), locale);
    const endMonth = monthName(end.getMonth(), locale);
    return startMonth === endMonth
      ? `${start.getDate()}–${end.getDate()} ${startMonth}`
      : `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth}`;
  }
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'long' }).formatRange(start, end);
}
