/** Progress tab v2 — Hebrew display helpers. Pure. */
import { formatNumber, weekdayName } from '@/lib/i18n/core/fmt';
import { monthLabel } from '@/lib/i18n/fmt-display';
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';
import { unitLabel, weekdayLabel } from '@/lib/i18n/units';

/** Sunday-first narrow weekday names ("א׳"…"ש׳"), Hebrew — the same text `Intl` gives for weekday: 'narrow'. */
export const WEEKDAY_SHORT = Array.from({ length: 7 }, (_, i) => weekdayName(i, SOURCE_LOCALE, 'narrow'));

export function monthName(m: number, locale: Locale = SOURCE_LOCALE): string {
  return monthLabel(m, locale, 'long');
}

export function monthShort(m: number, locale: Locale = SOURCE_LOCALE): string {
  return monthLabel(m, locale, 'short');
}

/** "19–25 באוק׳" (same month) / "29 בספט׳–5 באוק׳". */
export function weekRangeLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ב${monthShort(end.getMonth())}`;
  return `${start.getDate()} ב${monthShort(start.getMonth())}–${end.getDate()} ב${monthShort(end.getMonth())}`;
}

/** "214" דק׳ under 10h, else "12:40" שע׳. */
export function formatMinutes(min: number, locale: Locale = SOURCE_LOCALE): { value: string; unit: string } {
  const m = Math.max(0, Math.round(min));
  if (m < 600) return { value: formatNumber(m, locale), unit: unitLabel('min') };
  return { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: unitLabel('hour') };
}

/** h:mm always (tab headers: "3:55 שע׳"). */
export function formatHours(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function formatKm(km: number, locale: Locale = SOURCE_LOCALE): string {
  return formatNumber(Math.round(km * 10) / 10, locale, { maximumFractionDigits: 1 });
}

/** min/km → "5:42". */
export function formatPace(pace: number): string {
  if (!(pace > 0)) return '—';
  let m = Math.floor(pace);
  let s = Math.round((pace - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCount(n: number, locale: Locale = SOURCE_LOCALE): string {
  return formatNumber(Math.round(n), locale);
}

/** "היום" / "אתמול" / "שלישי" (this week) / "לפני 9 ימים" / "4 באוק׳". */
export function relativeDay(d: Date, now: Date): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff <= 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff < 7) return weekdayLabel(d.getDay(), 'long');
  if (diff < 14) return 'שבוע שעבר';
  return `${d.getDate()} ב${monthShort(d.getMonth())}`;
}

/** "9 באוק׳" from YYYY-MM-DD. */
export function isoDayLabel(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return `${Number(iso.slice(8, 10))} ב${monthShort(m)}`;
}

/** Hebrew count noun: 1 → singular phrase, else "N plural". */
export function countNoun(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}
