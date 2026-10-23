/**
 * Unit strings next to numbers ("12.3 ק״מ", "45 דק׳") and weekday names, read from the `common` catalog
 * (keys `units.*`, `weekdays.*`) — i18n wave 3B. Pure: no hooks, no stores, so engines, services and
 * canvas code can use it. The Hebrew text is byte-identical to the literals they used to carry.
 *
 * `t` defaults to Hebrew (`makeT` over the statically bundled catalog), the same pattern as the schedule
 * engines' `defaultScheduleT`. A component passes its own `useT(common)`; a function that already knows
 * a locale passes `makeT(locale, common)`. Numbers are metric in every language (PLAN decision 6): only
 * the unit word changes, the caller formats the number (`String(n)`, `toFixed`, `formatNumber`).
 */
import type { NamespaceKey } from './catalogs';
import type { MessageValues } from './core/i18n-core';
import { SOURCE_LOCALE } from './locales';
import { makeT } from './t';
import { common } from '@/messages/ns/common';

/** Any translator over `common`: `makeT(locale, common)` and the component-side `useT(common)` both fit. */
export type CommonT = (key: NamespaceKey<typeof common>, values?: MessageValues) => string;

let heT: CommonT | undefined;
/** The Hebrew `common` translator (what every caller used before they could pass their own). */
export const defaultCommonT = (): CommonT => (heT ??= makeT(SOURCE_LOCALE, common));

/** Units that sit after a number: `{n} ק״מ`. `kmAscii` / `mAscii` keep the ASCII quote / apostrophe two old call sites used. */
export type UnitId = 'km' | 'kmAscii' | 'm' | 'mAscii' | 'min' | 'hour' | 'minutes' | 'steps';
/** Units shown on their own, as the `unit` of a value/unit pair ("ק״מ", "דק׳ לק״מ"). */
export type UnitLabelId = 'km' | 'm' | 'min' | 'hour' | 'minutes' | 'hours' | 'kmh' | 'kg' | 'minPerKm' | 'steps';

/** `withUnit('km', '12.3')` → "12.3 ק״מ". `n` is the already formatted number (a plain string — never a number argument, ICU would add a thousands separator). */
export function withUnit(unit: UnitId, n: string | number, t: CommonT = defaultCommonT()): string {
  return t(`units.${unit}`, { n: String(n) });
}

/** `unitLabel('km')` → "ק״מ". */
export function unitLabel(unit: UnitLabelId, t: CommonT = defaultCommonT()): string {
  return t(`units.label.${unit}`);
}

export type WeekdayStyle = 'long' | 'short' | 'letter';
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Weekday name for 0 = Sunday … 6 = Saturday, in the three styles the app already shows:
 * long "ראשון" (no "יום"), short "א׳", letter "א". NOT `Intl` (its long form is "יום ראשון").
 * An index outside 0–6 (or a non-integer) gives '' — the old arrays gave `undefined`, which every caller
 * either rendered as nothing or guarded with `?? ''`.
 */
export function weekdayLabel(index: number, style: WeekdayStyle, t: CommonT = defaultCommonT()): string {
  if (!Number.isInteger(index) || index < 0 || index > 6) return '';
  return t(`weekdays.${style}.${index as WeekdayIndex}`);
}

/** All seven names, Sunday first — for the few exported constants that used to be literal arrays. */
export function weekdayLabels(style: WeekdayStyle, t: CommonT = defaultCommonT()): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayLabel(i, style, t));
}
