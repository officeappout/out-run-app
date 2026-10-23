/** Namespace `together`: the together layer (src/features/workout-engine/together). See docs/i18n/HOW-TO.md. */
import he from '../he/together.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const together = defineNamespace('together', he);

/** A key of the `together` namespace — keep keys (not text) in constants / state, translate at render. */
export type TogetherKey = NamespaceKey<typeof together>;
