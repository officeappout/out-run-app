/**
 * The weekday argument for onboarding messages that already carry the Hebrew geresh themselves
 * ("מה מתאמנים ביום {day}׳?", "שעה ביום {letter}׳"): Hebrew gets the bare letter (so the output is
 * byte-identical to before), every other language gets its short weekday name ("Sun", "Mon" …).
 */
import { weekdayLabel, type CommonT } from '@/lib/i18n/units';
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';

export function weekdayMessageArg(dow: number, locale: Locale, t?: CommonT): string {
  return weekdayLabel(dow, locale === SOURCE_LOCALE ? 'letter' : 'short', t);
}
