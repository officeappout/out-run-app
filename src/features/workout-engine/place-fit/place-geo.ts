/**
 * The two distances the hybrid rule needs, from data the client already has
 * (no reads): the nearest on-foot official route to a park (the cached
 * official routes), and the first park on / beside a route (its facility
 * stops and fitness-station amenities). Pure.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { cumulativeKm } from '@/features/parks/core/components/overview/route/route-overview';
import { accessKm } from '../players/running/lib/route-fit/route-traits';
import { nearbyRunRoutes } from '../players/running/lib/route-fit/suggest-routes-for-workout';
import { HYBRID_MAX_KM } from './suggest-workouts-for-place';
import type { ParkNearRoute } from './types';

export interface LatLng { lat: number; lng: number }

/** km to the nearest on-foot official route within `radiusKm`, or null when none is that close. */
export function nearestRouteKmFromPark(routes: readonly Route[], park: LatLng, radiusKm = HYBRID_MAX_KM): number | null {
  let best: number | null = null;
  for (const r of nearbyRunRoutes(routes, park, radiusKm)) {
    const d = accessKm(r, park);
    if (Number.isFinite(d) && (best == null || d < best)) best = d;
  }
  return best;
}

const PARK_STOP_TYPE = /gym|fitness|park|calisth|workout/i;

function nearestIndex(path: readonly [number, number][], lat: number, lng: number): { i: number; km: number } {
  let i = 0;
  let km = Infinity;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    const d = Math.hypot((p[1] - lat) * 111.32, (p[0] - lng) * 111.32 * Math.cos((lat * Math.PI) / 180));
    if (d < km) { km = d; i = k; }
  }
  return { i, km };
}

/** The first park along the route (by km from the start), or null. */
export function parkNearRoute(route: Pick<Route, 'path' | 'facilityStops' | 'nearbyAmenities'>): ParkNearRoute | null {
  const path = route.path;
  if (!Array.isArray(path) || path.length < 2) return null;
  const cum = cumulativeKm(path);
  const found: ParkNearRoute[] = [];
  for (const s of route.facilityStops ?? []) {
    if (!PARK_STOP_TYPE.test(s.type ?? '')) continue;
    const n = nearestIndex(path, s.lat, s.lng);
    const idx = Number.isInteger(s.waypointIndex) && s.waypointIndex >= 0 && s.waypointIndex < path.length ? s.waypointIndex : n.i;
    found.push({ name: s.name || null, atKm: round1(cum[idx]), offRouteKm: n.km });
  }
  for (const a of route.nearbyAmenities ?? []) {
    if (a.category !== 'fitness_station' || !a.location) continue;
    const n = nearestIndex(path, a.location.lat, a.location.lng);
    const off = Number.isFinite(a.distanceFromPathMeters) ? a.distanceFromPathMeters / 1000 : n.km;
    found.push({ name: null, atKm: round1(cum[n.i]), offRouteKm: off });
  }
  const close = found.filter((f) => f.offRouteKm <= HYBRID_MAX_KM);
  if (close.length === 0) return null;
  close.sort((a, b) => (a.atKm ?? Infinity) - (b.atKm ?? Infinity));
  return close[0];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
