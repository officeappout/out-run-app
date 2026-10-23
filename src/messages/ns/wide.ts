/** Namespace `wide`: TV mode (src/features/tv-mode, enable_tv_mode_v1) — pairing (`pair.*`), phone remote (`remote.*`), lost connection (`lost.*`), shared room (`lobby.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/wide.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const wide = defineNamespace('wide', he);

/** A key of the `wide` namespace — keep keys (not text) in constants / state, translate at render. */
export type WideKey = NamespaceKey<typeof wide>;
