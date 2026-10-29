/**
 * "איפה כדאי לרוץ" — static surface tips (like the legacy SURFACE_CARDS,
 * with the "סטוריית ת"א" typo fixed and icon keys instead of emoji). The
 * order follows the workout kind: reps want a measured track first, easy
 * and long runs a soft trail or a flowing promenade.
 */

import type { RunKind } from './run-kind';
import { rt } from '../run-utils-t';

export type SurfaceIcon = 'track' | 'trail' | 'road';

export interface SurfaceTile {
  id: SurfaceIcon;
  label: string;
  tip: string;
  icon: SurfaceIcon;
}

/** `label` / `tip` are getters: the text follows the current language each time it is read. */
const tile = (id: SurfaceIcon): SurfaceTile => ({
  id,
  get label() { return rt(`runUtils.surface.${id}.label`); },
  get tip() { return rt(`runUtils.surface.${id}.tip`); },
  icon: id,
});

export const SURFACE_TILES: Record<SurfaceIcon, SurfaceTile> = { track: tile('track'), trail: tile('trail'), road: tile('road') };

const ORDER: Record<RunKind, SurfaceIcon[]> = {
  interval: ['track', 'trail', 'road'],
  tempo: ['track', 'road', 'trail'],
  long: ['road', 'trail', 'track'],
  easy: ['trail', 'road', 'track'],
};

export function surfaceTilesFor(kind: RunKind): SurfaceTile[] {
  return ORDER[kind].map((id) => SURFACE_TILES[id]);
}
