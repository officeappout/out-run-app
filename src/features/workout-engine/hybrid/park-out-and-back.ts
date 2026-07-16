/**
 * park-out-and-back — Phase 1.1 of the hybrid "full workout in the park" card.
 *
 * Resolves the nearest EQUIPPED primary-fitness park to the user and produces an
 * OUT-AND-BACK route (user → park → user) plus a round-trip distance. This is the
 * geometry + park-resolution primitive the Phase 1.3 branch will consume; nothing
 * wires it yet (additive, dark).
 *
 * ⚠️ VERIFIED (not assumed): the route generator's `destination` mode is a ONE-WAY
 * commute (user→park via getSmartPathAlternatives — route-generator.service.ts
 * §90-108,544-553,937-998). It does NOT return a round trip. We therefore SYNTHESISE
 * the return leg by appending the reversed outbound path (real-street geometry both
 * ways). When the commute call yields no usable geometry we fall back to a straight
 * two-point out-and-back so a station is never silently dropped for a geometry gap.
 *
 * Pure core (no I/O, unit-tested): buildOutAndBackPath / roundTripKm / nearestEquippedPark.
 * Only resolveParkOutAndBack does async I/O, and every heavy dep (gear-mapping /
 * route generator / cache warm-up → Firestore) is DYNAMICALLY imported inside it, so
 * the pure functions and their tests stay Firestore-free.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import type { StationPark } from './find-station-park.service';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { isPrimaryFitness } from './park-fitness.util';

/** A canonical route vertex: `[lng, lat]` (matches RoutePath used across the engine). */
export type LngLat = [number, number];

/** Latitude/longitude point (matches userPosition and park.location). */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Append the reversed outbound leg so a one-way user→park path becomes a full
 * out-and-back user→park→user. The turnaround vertex (last of `outbound`) is NOT
 * duplicated. Pure. Inputs shorter than 2 vertices are returned unchanged.
 *
 *   [A,B,C] → [A,B,C,B,A]   ·   [A,B] → [A,B,A]   ·   [A] → [A]   ·   [] → []
 *
 * For any input of length n ≥ 2 the result length is 2n − 1.
 */
export function buildOutAndBackPath(outbound: LngLat[]): LngLat[] {
  if (outbound.length < 2) return [...outbound];
  const returnLeg = outbound.slice(0, -1).reverse();
  return [...outbound, ...returnLeg];
}

/** Straight-line round-trip distance (km): user↔park one-way haversine × 2. */
export function roundTripKm(user: LatLng, park: LatLng): number {
  const oneWayMeters = haversineMeters(user.lat, user.lng, park.lat, park.lng);
  return (oneWayMeters * 2) / 1000;
}

export interface NearestEquippedParkOpts {
  /** Optional cap on one-way walking distance (metres). Undefined = no cap. */
  maxRadiusMeters?: number;
}

/**
 * Nearest EQUIPPED primary-fitness park to the user. PURE (operates on the given
 * parks array; no gear translation, no I/O — that needs a warm cache and lives in
 * resolveParkOutAndBack). A park qualifies when it is a primary-fitness facility
 * (isPrimaryFitness), carries at least one gymEquipment entry, and has a location.
 * Returns the closest qualifier, or null when none qualify (Phase 3 hides the card).
 */
export function nearestEquippedPark(
  user: LatLng,
  parks: Park[],
  opts: NearestEquippedParkOpts = {},
): Park | null {
  let best: { park: Park; dist: number } | null = null;
  for (const p of parks) {
    if ((p.gymEquipment?.length ?? 0) === 0) continue;
    if (p.location?.lat == null || p.location?.lng == null) continue;
    if (!isPrimaryFitness(p)) continue;
    const dist = haversineMeters(user.lat, user.lng, p.location.lat, p.location.lng);
    if (opts.maxRadiusMeters != null && dist > opts.maxRadiusMeters) continue;
    if (!best || dist < best.dist) best = { park: p, dist };
  }
  return best?.park ?? null;
}

/** Normalise a raw generator path to canonical `[lng, lat]` vertices. */
function normalizePath(raw: unknown): LngLat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude]))
    .filter((c: any[]) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as LngLat[];
}

export interface ResolveParkOutAndBackArgs {
  userPosition: LatLng;
  /** Candidate parks (same all-parks set composeHybridPlan already fetches). */
  parks: Park[];
  aerobicKind: 'walking' | 'running';
  cityName?: string;
  /** Optional cap on one-way walking distance to the park (metres). */
  maxRadiusMeters?: number;
}

export interface ParkOutAndBack {
  /** Out-and-back user→park→user, canonical `[lng, lat]` vertices. */
  routePath: LngLat[];
  /** The resolved equipped park; `waypointIndex` = the turnaround vertex index. */
  station: StationPark;
  /** Straight-line round-trip distance (km). */
  targetKm: number;
}

/**
 * Resolve the nearest equipped park + an out-and-back route to it. Returns null when
 * no equipped primary park qualifies (or its equipment fails to translate).
 *
 * I/O: warms the equipment cache, translates gear ids, and calls the route generator
 * in commute mode — all dynamically imported. Synthesises a straight there-and-back
 * when the commute call returns no usable geometry (⚠️ generator does not round-trip).
 */
export async function resolveParkOutAndBack(
  args: ResolveParkOutAndBackArgs,
): Promise<ParkOutAndBack | null> {
  const park = nearestEquippedPark(args.userPosition, args.parks, {
    maxRadiusMeters: args.maxRadiusMeters,
  });
  if (!park || park.location?.lat == null || park.location?.lng == null) return null;

  // Translate gear ids — requires a warm equipment cache (park-equipment.util ⚠️).
  const [{ warmHybridCaches }, { parkGymEquipmentToGearIds }, { normalizeGearIds }] =
    await Promise.all([
      import('./hybrid-warmup'),
      import('./park-equipment.util'),
      import('@/features/workout-engine/shared/utils/gear-mapping.utils'),
    ]);
  await warmHybridCaches();
  const availableEquipment = parkGymEquipmentToGearIds(park.gymEquipment, normalizeGearIds);
  if (availableEquipment.length === 0) return null; // nothing translated → not a usable station

  const targetKm = roundTripKm(args.userPosition, {
    lat: park.location.lat,
    lng: park.location.lng,
  });

  // One-way user→park via the generator's commute mode; synthesise on empty geometry.
  let outbound: LngLat[] = [];
  try {
    const { generateDynamicRoutes } = await import(
      '@/features/parks/core/services/route-generator.service'
    );
    const routes = await generateDynamicRoutes({
      userLocation: args.userPosition,
      destination: { lat: park.location.lat, lng: park.location.lng },
      activity: args.aerobicKind as ActivityType,
      targetDistance: targetKm, // ignored in commute mode, but required by the options type
      routeGenerationIndex: 0,
      preferences: { includeStrength: false }, // ignored in commute mode
      parks: args.parks as any, // Park[] → MapPark[] (same cast the hybrid path uses)
      cityName: args.cityName,
    });
    outbound = normalizePath(routes?.[0]?.path);
  } catch {
    /* fall through to straight synthesis */
  }
  if (outbound.length < 2) {
    // ⚠️ Synthesise a straight two-point outbound when the commute call gave nothing.
    outbound = [
      [args.userPosition.lng, args.userPosition.lat],
      [park.location.lng, park.location.lat],
    ];
  }

  const routePath = buildOutAndBackPath(outbound);
  const station: StationPark = {
    parkId: park.id,
    name: park.name,
    lat: park.location.lat,
    lng: park.location.lng,
    waypointIndex: outbound.length - 1, // the park sits at the turnaround vertex
    availableEquipment,
    image: park.image ?? (park as any).imageUrl ?? park.images?.[0],
  };

  return { routePath, station, targetKm };
}
