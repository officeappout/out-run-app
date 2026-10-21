/**
 * Where a route opened OUTSIDE the map (GlobalDetailOverlay — home cards,
 * push deep links) is shown (enable_home_v2). Pure.
 *
 *   'map'    — hand it to the map: Discover selects + focuses it and opens the
 *              ONE route overview drawer (RouteOverviewOverlay).
 *   'legacy' — today's RouteDetailSheet, in place: flag off, a route with no
 *              line to draw, or already on /map with Discover not mounted
 *              (a live workout, the planned-run preview …) — the map can't
 *              take it right now.
 *   'sheet'  — enable_map_polish_v1 (on top of enable_home_v2): every case that
 *              would be 'legacy' under v2 shows the v2 route overview as a
 *              standalone sheet instead (no map line behind it).
 */

import type { Route } from '../types/route.types';

export type RouteOpenTarget = 'map' | 'legacy' | 'sheet';

export interface RouteOpenContext {
  v2: boolean;
  route: Pick<Route, 'path'>;
  /** The current pathname is /map. */
  onMap: boolean;
  /** Discover (the route overview's host) is mounted right now. */
  hostMounted: boolean;
  /** enable_map_polish_v1 — the v2 fallback is the v2 sheet, never the legacy one. Omit → off. */
  polish?: boolean;
}

export function routeOpenTarget({ v2, route, onMap, hostMounted, polish = false }: RouteOpenContext): RouteOpenTarget {
  if (!v2) return 'legacy';
  const fallback: RouteOpenTarget = polish ? 'sheet' : 'legacy';
  if (!Array.isArray(route.path) || route.path.length < 2) return fallback;
  if (onMap && !hostMounted) return fallback;
  return 'map';
}

/** A hand-off older than this is dropped (the map never came up — e.g. a location gate). */
export const ROUTE_OPEN_TTL_MS = 60_000;

export function isRouteOpenFresh(at: number, now: number): boolean {
  return now - at >= 0 && now - at <= ROUTE_OPEN_TTL_MS;
}
