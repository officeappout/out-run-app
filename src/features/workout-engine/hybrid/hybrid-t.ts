/**
 * The Hebrew `player` translator — the default `t` of the pure hybrid helpers (guided-station, station-tutorial,
 * hybrid-walk-state, v2/hybrid-v2-view, v2/hybrid-v2-list), the same pattern as `defaultCommonT` in
 * `@/lib/i18n/units`. A component passes its own `useT(player)`; a caller that does not (tour replay, tests)
 * gets the Hebrew catalog text, byte-identical to what the helpers returned before.
 */
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { player, type PlayerT } from '@/messages/ns/player';

let heT: PlayerT | undefined;
export const defaultPlayerT = (): PlayerT => (heT ??= makeT(SOURCE_LOCALE, player));
