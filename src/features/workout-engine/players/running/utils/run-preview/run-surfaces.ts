/**
 * "איפה כדאי לרוץ" — static surface tips (like the legacy SURFACE_CARDS,
 * with the "סטוריית ת"א" typo fixed and icon keys instead of emoji). The
 * order follows the workout kind: reps want a measured track first, easy
 * and long runs a soft trail or a flowing promenade.
 */

import type { RunKind } from './run-kind';

export type SurfaceIcon = 'track' | 'trail' | 'road';

export interface SurfaceTile {
  id: SurfaceIcon;
  label: string;
  tip: string;
  icon: SurfaceIcon;
}

export const SURFACE_TILES: Record<SurfaceIcon, SurfaceTile> = {
  track: { id: 'track', label: 'מסלול אתלטיקה', tip: 'מדויק לחזרות', icon: 'track' },
  trail: { id: 'trail', label: 'שביל בפארק', tip: 'רך למפרקים', icon: 'trail' },
  road: { id: 'road', label: 'טיילת או כביש', tip: 'זורם לריצות ארוכות', icon: 'road' },
};

const ORDER: Record<RunKind, SurfaceIcon[]> = {
  interval: ['track', 'trail', 'road'],
  tempo: ['track', 'road', 'trail'],
  long: ['road', 'trail', 'track'],
  easy: ['trail', 'road', 'track'],
};

export function surfaceTilesFor(kind: RunKind): SurfaceTile[] {
  return ORDER[kind].map((id) => SURFACE_TILES[id]);
}
