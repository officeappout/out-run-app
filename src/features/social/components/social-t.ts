/**
 * The translator type the social components' module-level helpers take as a
 * parameter (i18n wave 2, namespace `community`, `social.*` keys — docs/i18n/HOW-TO.md).
 * Components get it from `useT(community)` and pass it down.
 */
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { community } from '@/messages/ns/community';

export type CommunityKey = NamespaceKey<typeof community>;
export type SocialT = (key: CommunityKey, values?: MessageValues) => string;
