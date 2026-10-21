/** Namespace `profile`: profile, progress and activity screens. See docs/i18n/HOW-TO.md. */
import he from '../he/profile.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const profile = defineNamespace('profile', he);

/** A key of the `profile` namespace — keep keys (not text) in constants / state, translate at render. */
export type ProfileKey = NamespaceKey<typeof profile>;
