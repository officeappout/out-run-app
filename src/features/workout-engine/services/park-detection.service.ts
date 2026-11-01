/**
 * Park Detection Service — auto-tags workouts with the nearest park.
 *
 * Reads only the parks around the given point (getParksNear, data-exposure
 * plan 1.1), cached per point+radius for 10 minutes.
 * Default detection radius: 200 m (used for session-tagging).
 * Equipment resolution passes 1 000 m to cover specialised parks within
 * a ~15-minute walking distance.
 */

import { getParksNear } from '@/features/parks/core/services/parks.service';
import { calculateDistance } from '@/lib/services/location.service';
import type { Park } from '@/features/parks/core/types/park.types';

/** Default radius for session-tagging (tight — user must be at the park). */
const DETECTION_RADIUS_M = 200;

/** Extended radius for equipment resolution (covers parks within ~15-min walk). */
export const EQUIPMENT_DETECTION_RADIUS_M = 1_000;

const _parksCache = new Map<string, { parks: Park[]; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getParks(lat: number, lng: number, radiusM: number): Promise<Park[]> {
  const key = `${lat},${lng},${radiusM}`;
  const hit = _parksCache.get(key);
  if (hit && Date.now() < hit.expiry) return hit.parks;
  try {
    const parks = await getParksNear(lat, lng, radiusM);
    _parksCache.set(key, { parks, expiry: Date.now() + CACHE_TTL_MS });
    return parks;
  } catch (err) {
    console.warn('[ParkDetection] Failed to fetch parks:', err);
    return hit?.parks ?? [];
  }
}

export interface DetectedPark {
  parkId: string;
  parkName: string;
  /**
   * Owning authority of the matched park (city / neighborhood id).
   * Used as a fallback for `sessions.authorityId` when the user profile
   * doesn't have one — e.g. a guest finishing a workout in a known park.
   */
  authorityId: string | null;
}

/**
 * Find the closest park within `radiusM` metres of the given coordinates.
 *
 * @param lat     Latitude of the user's position.
 * @param lng     Longitude of the user's position.
 * @param radiusM Search radius in metres.
 *                Defaults to `DETECTION_RADIUS_M` (200 m) for session-tagging.
 *                Pass `EQUIPMENT_DETECTION_RADIUS_M` (1 000 m) when resolving
 *                park equipment so that specialised parks within walking distance
 *                are included.
 *
 * Returns null if no park is found within the radius.
 */
export async function detectNearbyPark(
  lat: number,
  lng: number,
  radiusM = DETECTION_RADIUS_M,
): Promise<DetectedPark | null> {
  if (!lat || !lng) return null;

  const parks = await getParks(lat, lng, radiusM);

  let closest: { park: Park; dist: number } | null = null;

  for (const park of parks) {
    const pLat = park.location?.lat ?? park.lat;
    const pLng = park.location?.lng ?? park.lng;
    if (pLat == null || pLng == null) continue;

    const dist = calculateDistance(lat, lng, pLat, pLng);
    if (dist <= radiusM && (!closest || dist < closest.dist)) {
      closest = { park, dist };
    }
  }

  if (!closest) return null;

  return {
    parkId: closest.park.id,
    parkName: closest.park.name,
    authorityId: closest.park.authorityId ?? null,
  };
}
