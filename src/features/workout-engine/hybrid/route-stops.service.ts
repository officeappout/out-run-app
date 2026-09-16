/**
 * route-stops.service — resolve the GENERIC STOPS along a real route from POIs
 * (route-stops §1a · master doc §7.3). This is the FAN-OUT counterpart of
 * find-station-park (which returns ONE station): here EVERY mapped POI within
 * `matchRadiusMeters` of the route becomes a stop, in path order, so a set of
 * hand-placed POIs drives a multi-stop "route + stops" workout.
 *
 * MODULARITY (clarification §2): the POI→stop decision is ONE data-driven function
 * (`mapParkToStop`). Adding a new location kind (a bench, a lookout) or a new facility
 * type is one branch here — the resolver loop, the composer, and the content dispatch
 * are untouched. The mapping reads ONLY fields David sets in the admin panel
 * (facilityType / natureType / urbanType + gymEquipment), so the mechanism is
 * "reuse existing fields", no new schema.
 *
 * PURE + sync. Equipment-id translation (`parkGymEquipmentToGearIds`) reads the warm
 * gear cache the SAME way find-station-park does, so the caller must warm caches
 * (`warmHybridCaches`) before calling — exactly as composeHybridPlan already does.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type {
  HybridStopCandidate,
  StopActivityKind,
  StopLocationKind,
} from './compose-hybrid-session.service';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { normalizeGearIds } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { parkGymEquipmentToGearIds } from './park-equipment.util';
import { classifyParkStopRole } from '@/lib/park-stop-role';

/** A POI this close (m) to any route vertex counts as "on / adjacent to the route". */
export const DEFAULT_MATCH_RADIUS_M = 180;

/** Two kept stops must be at least this far apart (m) — below the match radius, above GPS jitter —
 *  so POIs clustered near the loop start don't collide on one vertex (P4). */
export const MIN_STOP_GAP_M = 150;

/** The resolved role of a POI as a generic stop. `cooldownEligible` is consumed by the
 *  near-end cooldown placement (route-stops Part 4); Part 2 only reads activity/location. */
export interface StopMapping {
  activityType: StopActivityKind;
  locationKind: StopLocationKind;
  /** Stretch/rest locations that may host the near-end cooldown (Part 4). */
  cooldownEligible: boolean;
}

/**
 * PURE: map a park/POI document to its GENERIC-STOP role, or null when it is not a
 * workout stop. Extensible registry — add a branch, never touch the decision loop.
 * Reads the panel-settable fields only (no new schema):
 *   gym_park (or any equipped park) → strength on iron
 *   observation_point / spring / nature_community / zen_spot → stretch / rest (cooldown-eligible)
 *   urban_spot: stairs → strength on stairs · bench/other → bodyweight core
 *
 * SPEC-07 redesign (17.09.2026): `park` here is catalog-shaped (no raw
 * natureType/urbanType/gymEquipment) — `start-hybrid-session.ts` feeds this
 * from `safeFetchRealParks()`. Equipment/gym_park is decided from the
 * catalog's own `hasUsableEquipment`/`facilityType` fields (always present).
 * Everything else is decided from `park.stopRole`, precomputed server-side
 * at catalog-build time by the SAME `classifyParkStopRole` this function
 * used to run inline — see src/lib/park-stop-role.ts for the single source
 * of truth both sides import. Verified byte-identical to the old inline
 * logic against all 1158 real published parks before this change (0
 * mismatches) — see scripts/_verify-stoprole-equivalence.ts.
 * `natureType`/`urbanType`/`category` fallback still works if this is ever
 * called with a full-record Park (classifyParkStopRole recomputes live).
 */
export function mapParkToStop(park: Park): StopMapping | null {
  const facility = (park as any).category ?? park.facilityType; // legacy fallback, matches classifyParkStopRole's own
  const equipped = (park.gymEquipment?.length ?? 0) > 0;
  if (facility === 'gym_park' || park.hasUsableEquipment || equipped) {
    return { activityType: 'strength', locationKind: 'gym', cooldownEligible: false };
  }
  if (park.stopRole) return park.stopRole;
  return classifyParkStopRole({
    facilityType: park.facilityType,
    natureType: park.natureType,
    urbanType: park.urbanType,
    category: (park as any).category,
  });
}

export interface ResolveRouteStopsOpts {
  /** Snap tolerance (m) from any route vertex. Default DEFAULT_MATCH_RADIUS_M (180). */
  matchRadiusMeters?: number;
  /** Minimum spacing (m) between kept stops (P4 dedupe). Default MIN_STOP_GAP_M (150). */
  minStopGapMeters?: number;
}

/** A resolved stop plus the mapping metadata later phases (cooldown) need. */
export interface ResolvedRouteStop extends HybridStopCandidate {
  /** From the mapping — the near-end cooldown placement (Part 4) reads this. */
  cooldownEligible: boolean;
  /** Snap distance (m) from the route path — diagnostics / tie-break. */
  distToPathM: number;
  /** The park's own display name — for the per-stop map marker (Part 5). */
  name?: string;
  /** The park's own photo — same fallback chain as the full-park station marker
   *  (imageUrl → image → images[0]). Absent → the marker falls back to its generic icon. */
  image?: string;
}

/**
 * Resolve the ordered GENERIC STOPS for a route from candidate POIs (mode א — stops on
 * an existing route). Every mapped POI within `matchRadiusMeters` of the path becomes a
 * stop, snapped to its nearest route vertex (`waypointIndex`), in path order. Strength
 * stops carry their translated gear ids; non-strength stops carry `[]` (bodyweight).
 *
 * Returns ALL matches (no cap) — the composer applies STATION_MAX + logs any truncation,
 * so there is no silent cap here.
 *
 * ⚠️ Requires a warm gear cache (caller runs `warmHybridCaches` first — as
 * composeHybridPlan / composeRouteStopsWorkout do).
 */
export function resolveRouteStops(
  routePath: [number, number][],
  parks: Park[],
  opts: ResolveRouteStopsOpts = {},
): ResolvedRouteStop[] {
  if (routePath.length < 2 || parks.length === 0) return [];
  const radius = opts.matchRadiusMeters ?? DEFAULT_MATCH_RADIUS_M;

  type Hit = { park: Park; mapping: StopMapping; waypointIndex: number; distToPath: number };
  const hits: Hit[] = [];
  for (const p of parks) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    const mapping = mapParkToStop(p);
    if (!mapping) continue;
    // Snap to the nearest route vertex (whole-path search — a POI can sit anywhere along
    // the line, not only near the midpoint). routePath vertices are [lng, lat].
    let dist = Infinity;
    let wp = -1;
    for (let i = 0; i < routePath.length; i++) {
      const dv = haversineMeters(p.location.lat, p.location.lng, routePath[i][1], routePath[i][0]);
      if (dv < dist) { dist = dv; wp = i; }
    }
    if (dist <= radius) hits.push({ park: p, mapping, waypointIndex: wp, distToPath: dist });
  }
  if (hits.length === 0) return [];

  // P4 — proximity-dedupe (geometry only): two POIs near the loop start otherwise snap to the same
  // vertex and render on top of each other. Greedy-keep in PREFERENCE order (equipped/strength >
  // core > stretch, then closer-to-path) so the richer station wins each cluster, dropping any stop
  // within `minGap` metres of an already-kept one. Survivors are then re-sorted into path order.
  const minGap = opts.minStopGapMeters ?? MIN_STOP_GAP_M;
  const preferenceRank = (h: Hit): number =>
    h.mapping.activityType === 'strength' ? 2 : h.mapping.activityType === 'core' ? 1 : 0;
  const kept: Hit[] = [];
  for (const h of [...hits].sort((a, b) => (preferenceRank(b) - preferenceRank(a)) || (a.distToPath - b.distToPath))) {
    const tooClose = kept.some((k) =>
      haversineMeters(h.park.location!.lat, h.park.location!.lng, k.park.location!.lat, k.park.location!.lng) < minGap);
    if (!tooClose) kept.push(h);
  }
  // Path order; if two survivors still share a vertex, the closer-to-path one comes first.
  kept.sort((a, b) => (a.waypointIndex - b.waypointIndex) || (a.distToPath - b.distToPath));

  return kept.map((h) => {
    const availableEquipment = h.mapping.activityType === 'strength'
      ? parkGymEquipmentToGearIds(h.park.gymEquipment, normalizeGearIds)
      : [];
    return {
      stopId: `poi:${h.park.id}`,
      parkId: h.park.id,
      locationKind: h.mapping.locationKind,
      lat: h.park.location!.lat,
      lng: h.park.location!.lng,
      waypointIndex: h.waypointIndex,
      availableEquipment,
      activityType: h.mapping.activityType,
      cooldownEligible: h.mapping.cooldownEligible,
      distToPathM: Math.round(h.distToPath),
      name: h.park.name,
      // Same fallback chain as resolveParkOutAndBack's station (park-out-and-back.ts) —
      // imageUrl (Bunny, real park photo) first, was inverted (image → imageUrl).
      image: (h.park as any).imageUrl ?? h.park.image ?? h.park.images?.[0],
    };
  });
}
