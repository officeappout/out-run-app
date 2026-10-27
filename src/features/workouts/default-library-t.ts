/**
 * The Hebrew `library` translator — the default `t` of the pure workouts helpers (section grouping), the same
 * pattern as `defaultCommonT` in `@/lib/i18n/units`. A component passes its own `useT(library)`; a caller that does
 * not gets the Hebrew catalog text, byte-identical to what the helper returned before.
 */
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { library, type LibraryT } from '@/messages/ns/library';

let heT: LibraryT | undefined;
export const defaultLibraryT = (): LibraryT => (heT ??= makeT(SOURCE_LOCALE, library));
