/**
 * Live trail paint for the run / walk players' "map first" pass
 * (enable_run_player_drawer_v1). Pure data — AppMap mounts two layers on the
 * 'live-path' source: a white casing (contrast on any tile) and the line.
 *
 *   free   — no route, no zones: solid brand line, the older part only a
 *            little lighter (no fade to transparent). Needs lineMetrics.
 *   route  — guided route: the line under the grey walked slice and the
 *            route ahead, so it shows where the runner left the route.
 *   zones  — planned run with zone segments: zone-coloured, solid. No
 *            gradient (line-progress restarts on every zone feature).
 *
 * Walking keeps the amber family; running / everything else the cyan family.
 */

import { zoneTrailColorExpression } from './mapLayersConfig';

export type LiveTrailKind = 'free' | 'route' | 'zones';

export const TRAIL_V1_RUN = '#00baf7';
export const TRAIL_V1_RUN_ROUTE = '#0284c7';
export const TRAIL_V1_WALK = '#f59e0b';
export const TRAIL_V1_WALK_ROUTE = '#d97706';

export const LIVE_TRAIL_LAYOUT = { 'line-join': 'round' as const, 'line-cap': 'round' as const };

/** '#00baf7' + alpha → 'rgba(0, 186, 247, a)'. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function liveTrailKind(hasZoneSegments: boolean, hasRoute: boolean): LiveTrailKind {
  if (hasZoneSegments) return 'zones';
  return hasRoute ? 'route' : 'free';
}

export interface LiveTrailPaint {
  casing: Record<string, unknown>;
  line: Record<string, unknown>;
}

export function liveTrailPaintV1(kind: LiveTrailKind, activityType?: string | null): LiveTrailPaint {
  const walking = activityType === 'walking';
  const brand = walking ? TRAIL_V1_WALK : TRAIL_V1_RUN;
  if (kind === 'route') {
    return {
      casing: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.8 },
      line: { 'line-color': walking ? TRAIL_V1_WALK_ROUTE : TRAIL_V1_RUN_ROUTE, 'line-width': 5, 'line-opacity': 0.9 },
    };
  }
  if (kind === 'zones') {
    return {
      casing: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 },
      line: { 'line-color': zoneTrailColorExpression(brand), 'line-width': 6, 'line-opacity': 1 },
    };
  }
  return {
    casing: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 },
    // Alpha lives in the gradient stops (they multiply with line-opacity).
    line: {
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, hexToRgba(brand, 0.7), 1, hexToRgba(brand, 1)],
      'line-width': 6,
    },
  };
}
