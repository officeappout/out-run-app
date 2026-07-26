/**
 * route-distance.utils — distance-along-route geometry
 * (HYBRID_ENGINE_DESIGN.md §5 build item 3).
 *
 * Bridges the gap the design flagged: `FacilityStop.waypointIndex` is a
 * vertex INDEX on the route polyline, not a distance. These helpers convert
 * between index-space and km-space so the hybrid composer (item 4) can fit
 * aerobic-leg targets to real stop spacing.
 *
 * Pure geometry only — stop SELECTION/scoring lives in composeHybridSession.
 * Reuses geoUtils.haversineMeters (single distance implementation).
 *
 * Path convention: [lng, lat] tuples (Mapbox order), same as Route.path.
 */

import { haversineMeters } from './geoUtils';

export type RoutePath = [number, number][];

/**
 * Cumulative distance (km) at every vertex of the path.
 * result[0] = 0; result[i] = km from start to vertex i; length === path.length.
 * Invalid vertices contribute 0 (defensive — mirrors the players' NaN guards).
 */
export function buildRoutePrefixKm(path: RoutePath): number[] {
  const prefix: number[] = new Array(path.length).fill(0);
  for (let i = 1; i < path.length; i++) {
    const [lng1, lat1] = path[i - 1];
    const [lng2, lat2] = path[i];
    const legM =
      Number.isFinite(lat1) && Number.isFinite(lng1) && Number.isFinite(lat2) && Number.isFinite(lng2)
        ? haversineMeters(lat1, lng1, lat2, lng2)
        : 0;
    prefix[i] = prefix[i - 1] + legM / 1000;
  }
  return prefix;
}

/** Total route length in km (0 for degenerate paths). */
export function totalRouteKm(prefixKm: number[]): number {
  return prefixKm.length > 0 ? prefixKm[prefixKm.length - 1] : 0;
}

/**
 * Distance-along-route (km) of a vertex index. Out-of-range indices clamp to
 * the ends — FacilityStop.waypointIndex is snapped upstream and may sit one
 * past the final vertex on legacy routes.
 */
export function kmAtIndex(prefixKm: number[], index: number): number {
  if (prefixKm.length === 0) return 0;
  const clamped = Math.min(Math.max(Math.round(index), 0), prefixKm.length - 1);
  return prefixKm[clamped];
}

/**
 * Nearest vertex index at a given distance-along-route (km).
 * Binary search over the (monotonic) prefix array; clamps to route ends.
 */
export function indexAtKm(prefixKm: number[], km: number): number {
  const n = prefixKm.length;
  if (n === 0) return 0;
  if (km <= 0) return 0;
  if (km >= prefixKm[n - 1]) return n - 1;

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefixKm[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  // lo = first vertex at/after km; pick the closer neighbour.
  return prefixKm[lo] - km <= km - prefixKm[lo - 1] ? lo : lo - 1;
}

/**
 * Km-along-route for a set of stop waypoint indices, sorted ascending by
 * position on the route. Returns { index, km } pairs so callers keep the
 * mapping back to the original stop.
 */
export function stopKmAlongRoute(
  prefixKm: number[],
  waypointIndices: number[],
): Array<{ index: number; km: number }> {
  return waypointIndices
    .map((index) => ({ index, km: kmAtIndex(prefixKm, index) }))
    .sort((a, b) => a.km - b.km);
}

/**
 * Leg lengths (km) produced by splitting the route at the given
 * along-route km marks: [start→stop1, stop1→stop2, …, stopN→end].
 * Marks are sorted internally; result length === marks.length + 1.
 */
export function legGapsKm(prefixKm: number[], stopKms: number[]): number[] {
  const total = totalRouteKm(prefixKm);
  const sorted = [...stopKms].sort((a, b) => a - b);
  const gaps: number[] = [];
  let prev = 0;
  for (const km of sorted) {
    gaps.push(Math.max(0, km - prev));
    prev = km;
  }
  gaps.push(Math.max(0, total - prev));
  return gaps;
}
