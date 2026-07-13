/**
 * find-station-park.service — pick the real park that becomes the strength station (Phase א).
 *
 * Mirrors route-stitching's PRIMARY categorization (gym_park / calisthenics), reuses
 * `haversineMeters`, and returns the nearest equipment-bearing PRIMARY park within
 * radius of the route midpoint, with its equipment normalized to canonical gear ids.
 * Returns null → the resolver falls back to a bodyweight station (never silent).
 */

import type { Park } from '@/features/parks/core/types/park.types';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { normalizeGearIds } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { parkGymEquipmentToGearIds } from './park-equipment.util';

export interface StationPark {
  parkId: string;
  name: string;
  lat: number;
  lng: number;
  waypointIndex: number;
  availableEquipment: string[]; // normalized canonical gear ids
}

const DEFAULT_RADIUS_M = 300; // matches FACILITY_SNAP_RADIUS_METERS

export interface FindStationParkOpts {
  /** Pre-loaded candidate parks (e.g. the map's parks). */
  parks?: Park[];
  /** Fallback source when `parks` is absent. */
  authorityId?: string | null;
  radiusMeters?: number;
}

/** True for a PRIMARY facility (dedicated fitness) — the only tier we station at for MVP. */
function isPrimaryFitness(p: Park): boolean {
  const sportTypes = Array.isArray(p.sportTypes) ? p.sportTypes : [];
  const category = (p as any).category ?? p.facilityType; // stored field is `category`
  return (
    sportTypes.some((t) => ['calisthenics', 'functional', 'crossfit'].includes(String(t))) ||
    category === 'gym_park'
  );
}

export async function findStationPark(
  routePath: [number, number][],
  opts: FindStationParkOpts = {},
): Promise<StationPark | null> {
  if (routePath.length < 2) return null;
  const midIdx = Math.floor(routePath.length / 2);
  const [midLng, midLat] = routePath[midIdx];
  const radius = opts.radiusMeters ?? DEFAULT_RADIUS_M;

  let parks = opts.parks;
  if ((!parks || parks.length === 0) && opts.authorityId) {
    try {
      const { getParksByAuthority } = await import('@/features/parks/core/services/parks.service');
      parks = await getParksByAuthority(opts.authorityId);
    } catch {
      parks = [];
    }
  }
  if (!parks || parks.length === 0) return null;

  const nearest = parks
    .filter((p) => (p.gymEquipment?.length ?? 0) > 0 && p.location?.lat != null && p.location?.lng != null)
    .filter(isPrimaryFitness)
    .map((p) => ({ p, dist: haversineMeters(midLat, midLng, p.location.lat, p.location.lng) }))
    .filter((x) => x.dist <= radius)
    .sort((a, b) => a.dist - b.dist)[0]?.p;
  if (!nearest) return null;

  const availableEquipment = parkGymEquipmentToGearIds(nearest.gymEquipment, normalizeGearIds);
  if (availableEquipment.length === 0) return null; // nothing translated → bodyweight fallback

  // Snap the station to the route vertex nearest the park.
  let waypointIndex = midIdx;
  let bestD = Infinity;
  for (let i = 0; i < routePath.length; i++) {
    const d = haversineMeters(nearest.location.lat, nearest.location.lng, routePath[i][1], routePath[i][0]);
    if (d < bestD) { bestD = d; waypointIndex = i; }
  }

  return {
    parkId: nearest.id,
    name: nearest.name,
    lat: nearest.location.lat,
    lng: nearest.location.lng,
    waypointIndex,
    availableEquipment,
  };
}
