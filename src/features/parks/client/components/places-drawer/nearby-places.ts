/**
 * nearby-places — PURE: the cached park catalog + the cached official routes → the places within
 * walking range of the user, each with the place-fit input the engine ranks workouts on
 * (enable_map_places_drawer_v1).
 *
 * Cheap by design: the catalog has no equipment list, so a park's place carries none — its
 * workout tags come from the place's traits only (a strength workout; a hybrid when an on-foot
 * route is within HYBRID_MAX_KM). The park's real equipment is read only when the user taps it.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import { routeHasActivity, routeMatchesActivity } from '@/features/parks/core/utils/route-activity-match';
import { accessKm } from '@/features/workout-engine/players/running/lib/route-fit/route-traits';
import { routeKm } from '@/features/workout-engine/players/running/lib/route-fit/distance-fit';
import {
  nearestRouteKmFromPark, parkNearRoute, type LatLng, type ParkPlace, type RoutePlace,
} from '@/features/workout-engine/place-fit';
import { nearbyPlaces, MAX_PLACES, WALK_RANGE_M } from './places-drawer.logic';

interface PlaceBase {
  key: string;
  id: string;
  name: string;
  distanceM: number;
}

export interface NearbyPark extends PlaceBase {
  kind: 'park';
  park: Park;
  engine: ParkPlace;
}

export interface NearbyRoute extends PlaceBase {
  kind: 'route';
  route: Route;
  km: number;
  engine: RoutePlace;
}

export type NearbyPlace = NearbyPark | NearbyRoute;

/** A park worth training at: usable equipment, or a fitness park. */
export function isTrainingPark(p: Pick<Park, 'hasUsableEquipment' | 'facilityType'>): boolean {
  return !!p.hasUsableEquipment || p.facilityType === 'gym_park';
}

/** An official route you can run or walk (untyped routes count; cycling-only don't). */
export function isOnFootRoute(r: Route): boolean {
  return !routeHasActivity(r) || routeMatchesActivity(r, 'running') || routeMatchesActivity(r, 'walking');
}

function parkDistanceM(p: Park, origin: LatLng): number {
  const loc = p.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return Infinity;
  return haversineKm(origin.lat, origin.lng, loc.lat, loc.lng) * 1000;
}

/** Closest point of the route; a start point farther than range + length is skipped without the full scan. */
function routeDistanceM(r: Route, origin: LatLng, radiusM: number): number {
  const s = Array.isArray(r.path) ? r.path[0] : null;
  if (!s || typeof s[0] !== 'number' || typeof s[1] !== 'number') return Infinity;
  if (haversineKm(origin.lat, origin.lng, s[1], s[0]) * 1000 > radiusM + routeKm(r) * 1000) return Infinity;
  return accessKm(r, origin) * 1000;
}

export function buildNearbyPlaces(
  parks: readonly Park[],
  routes: readonly Route[],
  origin: LatLng,
  radiusM = WALK_RANGE_M,
  max = MAX_PLACES,
): NearbyPlace[] {
  const parkRows: NearbyPark[] = [];
  for (const p of parks) {
    if (!p?.id || !isTrainingPark(p)) continue;
    const distanceM = parkDistanceM(p, origin);
    if (!(distanceM <= radiusM)) continue;
    parkRows.push({
      key: `park:${p.id}`, kind: 'park', id: p.id, name: p.name, distanceM, park: p,
      engine: { kind: 'park', parkId: p.id, equipment: [], nearestRouteKm: nearestRouteKmFromPark(routes, p.location) },
    });
  }
  const routeRows: NearbyRoute[] = [];
  for (const r of routes) {
    if (!r?.id || !Array.isArray(r.path) || r.path.length < 2 || !isOnFootRoute(r)) continue;
    const distanceM = routeDistanceM(r, origin, radiusM);
    if (!(distanceM <= radiusM)) continue;
    routeRows.push({
      key: `route:${r.id}`, kind: 'route', id: r.id, name: r.name, distanceM, route: r, km: routeKm(r),
      engine: { kind: 'route', route: r, parkNearRoute: parkNearRoute(r) },
    });
  }
  return nearbyPlaces<NearbyPlace>([...parkRows, ...routeRows], radiusM, max);
}
