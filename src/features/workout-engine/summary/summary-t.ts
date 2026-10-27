/**
 * The Hebrew `summary` translator — the default `t` of the pure summary mappings (v2-summary.mapping, run-type.mapping),
 * the same pattern as `defaultCommonT` in `@/lib/i18n/units`. A component passes its own `useT(summary)`; a caller that
 * does not (tests, engines) gets the Hebrew catalog text, byte-identical to what the mappings returned before.
 */
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { summary, type SummaryT } from '@/messages/ns/summary';

let heT: SummaryT | undefined;
export const defaultSummaryT = (): SummaryT => (heT ??= makeT(SOURCE_LOCALE, summary));
