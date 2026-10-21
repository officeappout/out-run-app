/** Namespace `community`: community groups — the group page (`group.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/community.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const community = defineNamespace('community', he);

/** A key of the `community` namespace — keep keys (not text) in constants / state, translate at render. */
export type CommunityKey = NamespaceKey<typeof community>;
