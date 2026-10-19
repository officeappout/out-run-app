/**
 * Published routes with stops near the user, or near what the user is looking at on the map
 * (viewport centre / selected park) — enable_hybrid_cards_v2. PURE (no I/O).
 *
 * A "stop" is any park/POI the route-stops composer would turn into a stop: the SAME
 * classification (mapParkToStop) within the SAME snap radius (DEFAULT_MATCH_RADIUS_M) — so a
 * route that shows "3 עצירות" on the card really composes with those stops.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { DEFAULT_MATCH_RADIUS_M, mapParkToStop } from '../route-stops.service';
import { sessionTypesForRoute } from './route-session-types';
import type { RouteWithStops } from './situation.types';

type LatLng = { lat: number; lng: number };

/** The route-stops composer's own start cap (start-hybrid-session ROUTE_STOPS_MAX_START_M). */
export const NEAR_USER_ROUTE_M = 800;
/** A route counts as "the one you're looking at" within this distance of the map focus. */
export const NEAR_FOCUS_ROUTE_M = 400;
/** A focused route further than this from the user is not offered (the walk there is too long). */
export const FOCUS_MAX_FROM_USER_M = 3000;

export interface RouteLike {
  id: string;
  name?: string;
  path?: unknown;
}

/** Normalise a raw route path to `[lng, lat]` vertices. */
export function normalizeRoutePath(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const p of raw as unknown[]) {
    let lng: unknown; let lat: unknown;
    if (Array.isArray(p)) { lng = p[0]; lat = p[1]; } else if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      lng = o.lng ?? o.longitude; lat = o.lat ?? o.latitude;
    }
    if (typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

export function minDistanceToPathM(point: LatLng, path: [number, number][]): number {
  let d = Infinity;
  for (const v of path) {
    const dv = haversineMeters(point.lat, point.lng, v[1], v[0]);
    if (dv < d) d = dv;
  }
  return d;
}

/** Count the stops a route would get (same classification + snap radius as the composer). */
export function countRouteStops(
  path: [number, number][],
  parks: Park[],
  radiusM: number = DEFAULT_MATCH_RADIUS_M,
): { stopCount: number; strengthStopCount: number } {
  if (path.length < 2 || parks.length === 0) return { stopCount: 0, strengthStopCount: 0 };
  // Cheap bbox pre-filter (≈ radius in degrees) before the per-vertex scan.
  let minLat = Infinity; let maxLat = -Infinity; let minLng = Infinity; let maxLng = -Infinity;
  for (const [lng, lat] of path) {
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
  }
  const pad = (radiusM / 111_000) * 1.5;
  let stopCount = 0;
  let strengthStopCount = 0;
  for (const p of parks) {
    const lat = p.location?.lat; const lng = p.location?.lng;
    if (lat == null || lng == null) continue;
    if (lat < minLat - pad || lat > maxLat + pad || lng < minLng - pad * 1.2 || lng > maxLng + pad * 1.2) continue;
    const mapping = mapParkToStop(p);
    if (!mapping) continue;
    if (minDistanceToPathM({ lat, lng }, path) > radiusM) continue;
    stopCount += 1;
    if (mapping.activityType === 'strength') strengthStopCount += 1;
  }
  return { stopCount, strengthStopCount };
}

export function findRoutesWithStops(args: {
  routes: RouteLike[];
  parks: Park[];
  user: LatLng;
  /** Viewport centre / selected park, when the user is browsing a place on the map. */
  focus?: LatLng | null;
}): RouteWithStops[] {
  const out: RouteWithStops[] = [];
  for (const r of args.routes) {
    const path = normalizeRoutePath(r.path);
    if (path.length < 2) continue;
    const fromUser = minDistanceToPathM(args.user, path);
    const focused = !!args.focus
      && minDistanceToPathM(args.focus, path) <= NEAR_FOCUS_ROUTE_M
      && fromUser <= FOCUS_MAX_FROM_USER_M;
    if (fromUser > NEAR_USER_ROUTE_M && !focused) continue;
    const counts = countRouteStops(path, args.parks);
    if (counts.stopCount === 0) continue;
    out.push({
      routeId: r.id,
      name: r.name,
      distanceFromUserM: Math.round(fromUser),
      focused,
      ...counts,
      sessionTypes: sessionTypesForRoute(counts),
    });
  }
  return out.sort((a, b) => (Number(b.focused) - Number(a.focused)) || (a.distanceFromUserM - b.distanceFromUserM));
}
