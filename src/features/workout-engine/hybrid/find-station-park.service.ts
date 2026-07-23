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
import { isPrimaryFitness } from './park-fitness.util';

export interface StationPark {
  parkId: string;
  name: string;
  lat: number;
  lng: number;
  waypointIndex: number;
  availableEquipment: string[]; // normalized canonical gear ids
  /** Cover image for the map station pin (ParkPhotoMarker). */
  image?: string;
}

const DEFAULT_RADIUS_M = 300; // matches FACILITY_SNAP_RADIUS_METERS

export interface FindStationParkOpts {
  /** Pre-loaded candidate parks (e.g. the map's parks). */
  parks?: Park[];
  /** Fallback source when `parks` is absent. */
  authorityId?: string | null;
  radiusMeters?: number;
  /**
   * Purposeful-distance band (metres from the route start ≈ the user). When set,
   * prefer a park within this band over the absolute-closest — a park on top of the
   * user fakes the aerobic leg. No park in-band → falls back to closest-to-path.
   */
  walkBand?: { minMeters: number; maxMeters: number };
}

export async function findStationPark(
  routePath: [number, number][],
  opts: FindStationParkOpts = {},
): Promise<StationPark | null> {
  if (routePath.length < 2) return null;
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

  // WHOLE-PATH search: a loop's midpoint sits far from the user, so a midpoint-only
  // search misses parks right next to the route. Collect every PRIMARY equipment park
  // within radius of ANY path vertex, with its distance-to-path + distance-from-start.
  const [startLng, startLat] = routePath[0];
  const candidates: Array<{ park: Park; distToPath: number; waypointIndex: number; distFromStart: number }> = [];
  let cEquip = 0, cPrimary = 0, nearestMiss = Infinity; // diag counters
  for (const p of parks) {
    if ((p.gymEquipment?.length ?? 0) === 0 || p.location?.lat == null || p.location?.lng == null) continue;
    cEquip++;
    if (!isPrimaryFitness(p)) continue;
    cPrimary++;
    let d = Infinity;
    let wp = 0;
    for (let i = 0; i < routePath.length; i++) {
      const dv = haversineMeters(p.location.lat, p.location.lng, routePath[i][1], routePath[i][0]);
      if (dv < d) { d = dv; wp = i; }
    }
    if (d < nearestMiss) nearestMiss = d;
    if (d <= radius) {
      candidates.push({ park: p, distToPath: d, waypointIndex: wp, distFromStart: haversineMeters(startLat, startLng, p.location.lat, p.location.lng) });
    }
  }
  // PURPOSEFUL station: prefer a park in the walking band (a real walk from the start),
  // closest-to-path within it, over the absolute-closest (which can sit on top of the
  // user and fake the aerobic leg). No in-band park → closest-to-path overall (A3-safe).
  const byPath = (a: typeof candidates[number], b: typeof candidates[number]) => a.distToPath - b.distToPath;
  const band = opts.walkBand;
  const inBand = band ? candidates.filter((c) => c.distFromStart >= band.minMeters && c.distFromStart <= band.maxMeters) : [];
  const best = (inBand.length ? [...inBand].sort(byPath) : [...candidates].sort(byPath))[0] ?? null;
  // DIAG (temporary): where the chain drops + which band the station came from.
  console.log(
    `[hybrid:diag] findStationPark parksIn=${parks.length} equip+loc=${cEquip} primary=${cPrimary} within${radius}m=${candidates.length}` +
    ` band=${band ? `${band.minMeters}-${band.maxMeters}m→${inBand.length}` : 'off'}` +
    ` nearest=${nearestMiss === Infinity ? '-' : nearestMiss.toFixed(0) + 'm'}` +
    ` winner=${best ? `"${best.park.name}" @${best.distToPath.toFixed(0)}m path / ${best.distFromStart.toFixed(0)}m start` : 'NONE→A3'}`,
  );
  if (!best) return null; // no equipment park on/near the path → bodyweight fallback (A3)

  const rawIds = (best.park.gymEquipment ?? []).map((e) => e.equipmentId).filter(Boolean);
  const availableEquipment = parkGymEquipmentToGearIds(best.park.gymEquipment, normalizeGearIds);
  // DIAG (temporary): what equipment does this station actually produce for the generator?
  console.log(
    `[hybrid:diag] station "${best.park.name}" raw(${rawIds.length})=[${rawIds.join(',')}]` +
    ` → canonical(${availableEquipment.length})=[${availableEquipment.join(',')}]`,
  );
  if (availableEquipment.length === 0) return null; // nothing translated → bodyweight fallback

  return {
    parkId: best.park.id,
    name: best.park.name,
    lat: best.park.location.lat,
    lng: best.park.location.lng,
    waypointIndex: best.waypointIndex,
    availableEquipment,
    // imageUrl (Bunny, real park photo) first — was inverted (image → imageUrl),
    // which surfaced the stale Firebase cover as the hybrid station image.
    image: (best.park as any).imageUrl ?? best.park.image ?? best.park.images?.[0],
  };
}
