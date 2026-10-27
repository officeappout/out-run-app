/** Namespace `map`: map screen, parks, free run, partner finder. See docs/i18n/HOW-TO.md. */
import he from '../he/map.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

export const map = defineNamespace('map', he);

/** A `map` key — for constants that hold a key and translate at render. */
export type MapKey = NamespaceKey<typeof map>;

/** A `map` translator passed into pure helpers (the caller's `useT(map)` / `makeT('he', map)`). */
export type MapT = (key: MapKey, values?: MessageValues) => string;
