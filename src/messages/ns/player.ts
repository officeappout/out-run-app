/** Namespace `player`: the live workout players (running: `run.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/player.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

export const player = defineNamespace('player', he);

/** A `player` key — for state / maps that hold a key and translate at render. */
export type PlayerKey = NamespaceKey<typeof player>;

/** A `player` translator passed into pure helpers (the caller's `useT(player)` / `makeT('he', player)`). */
export type PlayerT = (key: PlayerKey, values?: MessageValues) => string;
