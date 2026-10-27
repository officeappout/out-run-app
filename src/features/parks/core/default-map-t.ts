/**
 * The Hebrew `map` translator — the default `t` of the pure map helpers (buildHybridLegs, recenterControlLabel,
 * routeQuestionnaireLine), the same pattern as `defaultCommonT` in `@/lib/i18n/units`. A component passes its own
 * `useT(map)`; a caller that does not (HybridOverviewScreen's journey strip, tests) gets the Hebrew catalog text.
 */
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { map, type MapT } from '@/messages/ns/map';

let heT: MapT | undefined;
export const defaultMapT = (): MapT => (heT ??= makeT(SOURCE_LOCALE, map));
