/**
 * Smart "הליכה + כוח" backbone (enable_hybrid_cards_v2): a walk that starts and ends at the
 * user and goes THROUGH a nearby equipped park, about `targetKm` long.
 *
 *   user ──(street walk)──▶ park ──(loop of the remaining km around the park)──▶ park ──▶ user
 *
 * When the remaining km is too short for a loop, it is a plain out-and-back to the park.
 * Pure core: buildLollipopPath / rotateLoopToNearest / pickClosestKm. Only
 * resolveSmartWalkBackbone does I/O (Mapbox walking leg + the route generator's PUBLIC
 * generateDynamicRoutes — the generator file itself is not touched), all dynamically imported.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { haversineMeters, pathLengthMeters } from '@/features/parks/core/services/geoUtils';
import { nearestEquippedPark } from '../park-out-and-back';
import { normalizeRoutePath } from './routes-with-stops';

type LngLat = [number, number];
type LatLng = { lat: number; lng: number };

/** Below this many extra km the walk is a plain out-and-back to the park. */
export const MIN_EXTRA_LOOP_KM = 0.8;
export const SMART_WALK_ROUTE_ID = 'smart_walk_loop';

/** Rotate a closed loop so it starts at the vertex nearest `anchor` (and closes there). */
export function rotateLoopToNearest(loop: LngLat[], anchor: LatLng): LngLat[] {
  if (loop.length < 2) return loop;
  const closed = haversineMeters(loop[0][1], loop[0][0], loop[loop.length - 1][1], loop[loop.length - 1][0]) < 30;
  const ring = closed ? loop.slice(0, -1) : loop;
  let best = 0; let bestD = Infinity;
  ring.forEach((v, i) => {
    const d = haversineMeters(anchor.lat, anchor.lng, v[1], v[0]);
    if (d < bestD) { bestD = d; best = i; }
  });
  const rotated = [...ring.slice(best), ...ring.slice(0, best)];
  return [...rotated, rotated[0]];
}

/** outbound (user→park) + optional loop around the park + outbound reversed (park→user). */
export function buildLollipopPath(outbound: LngLat[], loop: LngLat[] | null): LngLat[] {
  if (outbound.length < 2) return [];
  const back = [...outbound].reverse();
  if (!loop || loop.length < 3) return [...outbound, ...back.slice(1)];
  return [...outbound, ...loop.slice(1), ...back.slice(1)];
}

export function pickClosestKm<T extends { distance?: number }>(routes: T[], targetKm: number): T | null {
  if (!routes.length) return null;
  return routes.reduce((a, b) =>
    Math.abs((b.distance ?? Infinity) - targetKm) < Math.abs((a.distance ?? Infinity) - targetKm) ? b : a);
}

export async function resolveSmartWalkBackbone(args: {
  userPosition: LatLng;
  parks: Park[];
  targetKm: number;
  parkId?: string;
  activity: 'walking' | 'running';
  cityName?: string;
  maxParkRadiusM: number;
}): Promise<{ routePath: LngLat[]; routeId: string; routeName?: string } | null> {
  const byId = args.parkId ? args.parks.find((p) => p.id === args.parkId) : undefined;
  const park = byId?.location?.lat != null
    ? byId
    : nearestEquippedPark(args.userPosition, args.parks, { maxRadiusMeters: args.maxParkRadiusM });
  if (!park || park.location?.lat == null || park.location?.lng == null) {
    console.warn('[smart-walk] no equipped park within reach → no backbone');
    return null;
  }
  const parkPt = { lat: park.location.lat, lng: park.location.lng };

  // user → park on real streets (straight line only when the walking fetch fails).
  let outbound: LngLat[] = [];
  try {
    const { fetchMapboxWalkLeg } = await import('../round-trip');
    const leg = await fetchMapboxWalkLeg(args.userPosition, parkPt);
    outbound = normalizeRoutePath(leg?.path);
  } catch { /* straight fallback below */ }
  if (outbound.length < 2) outbound = [[args.userPosition.lng, args.userPosition.lat], [parkPt.lng, parkPt.lat]];

  const outKm = pathLengthMeters(outbound) / 1000;
  const extraKm = args.targetKm - 2 * outKm;
  let loop: LngLat[] | null = null;
  if (extraKm >= MIN_EXTRA_LOOP_KM) {
    try {
      const { generateDynamicRoutes } = await import('@/features/parks/core/services/route-generator.service');
      const routes = await generateDynamicRoutes({
        userLocation: parkPt,
        targetDistance: extraKm,
        activity: args.activity as ActivityType,
        routeGenerationIndex: 0,
        preferences: { includeStrength: false, qualityRoute: true, maxRoutes: 3, idealWaypointDistanceKm: extraKm / 6 },
        parks: args.parks as unknown as Parameters<typeof generateDynamicRoutes>[0]['parks'],
        cityName: args.cityName,
      });
      const best = pickClosestKm(routes ?? [], extraKm);
      const raw = normalizeRoutePath(best?.path);
      if (raw.length >= 3) loop = rotateLoopToNearest(raw, parkPt);
    } catch { /* out-and-back below */ }
  }
  const routePath = buildLollipopPath(outbound, loop);
  if (routePath.length < 2) return null;
  console.log(
    `[smart-walk] park="${park.name}" out=${outKm.toFixed(2)}km loop=${loop ? (pathLengthMeters(loop) / 1000).toFixed(2) : '0'}km` +
    ` total=${(pathLengthMeters(routePath) / 1000).toFixed(2)}km (target ${args.targetKm.toFixed(2)}km)`,
  );
  return { routePath, routeId: SMART_WALK_ROUTE_ID, routeName: park.name ? `סיבוב דרך ${park.name}` : 'סיבוב דרך הגינה' };
}
