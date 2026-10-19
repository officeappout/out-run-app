/**
 * Smart "הליכה + כוח" backbone (enable_hybrid_cards_v2): a walk that starts and ends at the
 * user and goes THROUGH a nearby equipped park, about `targetKm` long.
 *
 *   user ──(street walk)──▶ park ──(loop of the remaining km around the park)──▶ park ──▶ user
 *
 * When the remaining km is too short for a loop, it is a plain out-and-back to the park.
 *
 * The walk REALLY visits the park (owner report 19.10.2026: the drawn loop passed the park by,
 * and the station landed on whatever other park the generic stop search found within 180 m):
 * the line steps into the park itself, a loop that does not start near the park is dropped,
 * a park the streets can't reach gives no backbone at all, and the session's ONE station is
 * that park, at the point the walk reaches it (anchorStopsToPark).
 *
 * Pure core: assembleSmartWalkPath / buildLollipopPath / rotateLoopToNearest / pickClosestKm /
 * anchorStopsToPark. Only
 * resolveSmartWalkBackbone does I/O (Mapbox walking leg + the route generator's PUBLIC
 * generateDynamicRoutes — the generator file itself is not touched), all dynamically imported.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { haversineMeters, pathLengthMeters } from '@/features/parks/core/services/geoUtils';
import { nearestEquippedPark } from '../park-out-and-back';
import { mapParkToStop, type ResolvedRouteStop } from '../route-stops.service';
import type { HybridAerobicKind } from '../aerobic-kind';
import { normalizeRoutePath } from './routes-with-stops';

type LngLat = [number, number];
type LatLng = { lat: number; lng: number };

/** Below this many extra km the walk is a plain out-and-back to the park. */
export const MIN_EXTRA_LOOP_KM = 0.8;
export const SMART_WALK_ROUTE_ID = 'smart_walk_loop';
/** The street walk must end this close to the park (m) — farther, the park is not reachable. */
export const PARK_REACH_M = 250;
/** The loop around the park must pass this close to it (m) — farther, it is not "around the park". */
export const LOOP_JOIN_M = 250;

/** Where the walk reaches the park: the vertex index of the park on the walk's path. */
export interface SmartWalkAnchor {
  parkId: string;
  lat: number;
  lng: number;
  waypointIndex: number;
}

const gapM = (a: LngLat, b: LngLat) => haversineMeters(a[1], a[0], b[1], b[0]);

/** Concatenate path pieces, skipping a vertex that repeats the previous one (< 1 m). */
function joinPaths(...parts: LngLat[][]): LngLat[] {
  const out: LngLat[] = [];
  for (const part of parts) {
    for (const v of part) {
      if (out.length > 0 && gapM(out[out.length - 1], v) < 1) continue;
      out.push(v);
    }
  }
  return out;
}

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
  if (!loop || loop.length < 3) return joinPaths(outbound, back);
  return joinPaths(outbound, loop, back);
}

/**
 * PURE: the whole smart walk, guaranteed to visit the park, or null when it can't.
 *   • the street walk must end within PARK_REACH_M of the park; the line then steps INTO the park
 *     (its last vertex is the park itself), so the drawn route passes through it;
 *   • the loop is kept only when it starts within LOOP_JOIN_M of the park (else out-and-back);
 *   • `anchorIndex` = the path vertex where the walk reaches the park (the station).
 */
export function assembleSmartWalkPath(args: {
  outbound: LngLat[];
  park: LatLng;
  loop: LngLat[] | null;
}): { routePath: LngLat[]; anchorIndex: number; loopUsed: boolean } | null {
  const { outbound, park } = args;
  if (outbound.length < 2) return null;
  const parkV: LngLat = [park.lng, park.lat];
  if (gapM(outbound[outbound.length - 1], parkV) > PARK_REACH_M) return null;
  const toPark = joinPaths(outbound, [parkV]);
  const loop = args.loop && args.loop.length >= 3 && gapM(args.loop[0], parkV) <= LOOP_JOIN_M ? args.loop : null;
  const routePath = buildLollipopPath(toPark, loop);
  if (routePath.length < 2) return null;
  return { routePath, anchorIndex: toPark.length - 1, loopUsed: loop != null };
}

/**
 * PURE: the smart walk's stops = ONE station, at the park the walk goes through, placed where the
 * walk reaches it. Other parks the generic stop search found near the line are walked past (they
 * are not what the card offered, and a park 150 m off the line is not "on the route").
 */
export function anchorStopsToPark(
  rawStops: ResolvedRouteStop[],
  anchor: SmartWalkAnchor,
  park?: Park,
): ResolvedRouteStop[] {
  const found = rawStops.find((s) => s.parkId === anchor.parkId);
  if (found) return [{ ...found, waypointIndex: anchor.waypointIndex, distToPathM: 0 }];
  const mapping = park ? mapParkToStop(park) : null;
  if (!park || !mapping) return [];
  // Not in the generic search (e.g. deduped against a neighbour): build it from the park itself.
  // availableEquipment [] → the compose point-fetches the park's real gear (getPark).
  return [{
    stopId: `poi:${park.id}`,
    parkId: park.id,
    locationKind: mapping.locationKind,
    lat: anchor.lat,
    lng: anchor.lng,
    waypointIndex: anchor.waypointIndex,
    availableEquipment: [],
    activityType: mapping.activityType,
    cooldownEligible: mapping.cooldownEligible,
    distToPathM: 0,
    name: park.name,
    image: (park as unknown as { imageUrl?: string }).imageUrl ?? park.image ?? park.images?.[0],
  }];
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
  activity: HybridAerobicKind;
  cityName?: string;
  maxParkRadiusM: number;
}): Promise<{ routePath: LngLat[]; routeId: string; routeName?: string; anchor: SmartWalkAnchor } | null> {
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
  const walk = assembleSmartWalkPath({ outbound, park: parkPt, loop });
  if (!walk) {
    console.warn(`[smart-walk] park="${park.name}" is not reachable on foot (walk ends > ${PARK_REACH_M}m from it) → no backbone`);
    return null;
  }
  const { routePath } = walk;
  console.log(
    `[smart-walk] park="${park.name}" out=${outKm.toFixed(2)}km loop=${walk.loopUsed && loop ? (pathLengthMeters(loop) / 1000).toFixed(2) : '0'}km` +
    `${loop && !walk.loopUsed ? ' (loop dropped: not around the park)' : ''}` +
    ` total=${(pathLengthMeters(routePath) / 1000).toFixed(2)}km (target ${args.targetKm.toFixed(2)}km)`,
  );
  return {
    routePath, routeId: SMART_WALK_ROUTE_ID, routeName: park.name ? `סיבוב דרך ${park.name}` : 'סיבוב דרך הגינה',
    anchor: { parkId: park.id, lat: parkPt.lat, lng: parkPt.lng, waypointIndex: walk.anchorIndex },
  };
}
