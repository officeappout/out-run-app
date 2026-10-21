/** Namespace `player`: the live workout players (running: `run.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/player.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const player = defineNamespace('player', he);

/** A `player` key — for state / maps that hold a key and translate at render. */
export type PlayerKey = NamespaceKey<typeof player>;
