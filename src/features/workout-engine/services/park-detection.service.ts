/**
 * Park Detection Service — auto-tags workouts with the nearest park.
 *
 * Uses a cached copy of the parks collection to avoid repeated Firestore reads.
 * A park is "detected" if the user's GPS position is within 200 m of its location.
 */

import { getAllParks } from '@/features/parks/core/services/parks.service';
import { calculateDistance } from '@/lib/services/location.service';
import type { Park } from '@/features/parks/core/types/park.types';

const DETECTION_RADIUS_M = 200;

let _parksCache: Park[] | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getParks(): Promise<Park[]> {
  if (_parksCache && Date.now() < _cacheExpiry) return _parksCache;

  try {
    _parksCache = await getAllParks();
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return _parksCache;
  } catch (err) {
    console.warn('[ParkDetection] Failed to fetch parks:', err);
    return _parksCache ?? [];
  }
}

export interface DetectedPark {
  parkId: string;
  parkName: string;
}

/**
 * Find the closest park within 200 m of the given coordinates.
 * Returns null if no park is nearby.
 */
export async function detectNearbyPark(
  lat: number,
  lng: number,
): Promise<DetectedPark | null> {
  if (!lat || !lng) return null;

  const parks = await getParks();

  let closest: { park: Park; dist: number } | null = null;

  for (const park of parks) {
    const pLat = park.location?.lat ?? park.lat;
    const pLng = park.location?.lng ?? park.lng;
    if (pLat == null || pLng == null) continue;

    const dist = calculateDistance(lat, lng, pLat, pLng);
    if (dist <= DETECTION_RADIUS_M && (!closest || dist < closest.dist)) {
      closest = { park, dist };
    }
  }

  if (!closest) return null;

  return {
    parkId: closest.park.id,
    parkName: closest.park.name,
  };
}
