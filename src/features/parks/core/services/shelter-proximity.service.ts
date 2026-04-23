/**
 * Shelter Proximity Service
 *
 * Dual-mode distance calculation between parks and the nearest shelter.
 * Walking speed (1.4 m/s) for UI display; emergency sprint speed (3 m/s)
 * for civil-defense validation.
 *
 * Display is gated by the authority's `isShelterDisplayEnabled` toggle and
 * `maxShelterWalkingMinutes` threshold.
 */

import { calculateDistance } from '@/lib/services/location.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Authority } from '@/types/admin-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALKING_SPEED_MS = 1.4;
const EMERGENCY_SPEED_MS = 3.0;
const DEFAULT_MAX_WALKING_MINUTES = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShelterProximityResult {
  /** The shelter/safe-zone park closest to the target */
  shelter: Park;
  /** Straight-line distance in meters */
  distanceMeters: number;
  /** Walking time in seconds (1.4 m/s) */
  walkingTimeSeconds: number;
  /** Walking time rounded to whole minutes for display */
  walkingTimeMinutes: number;
  /** Emergency sprint time in seconds (3 m/s) */
  emergencyTimeSeconds: number;
}

export interface ShelterDisplayDecision {
  /** Whether the shelter tag should be shown */
  show: boolean;
  /** The proximity result (null when no shelter nearby or display disabled) */
  proximity: ShelterProximityResult | null;
  /** Reason the tag is hidden (for debugging) */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

function computeProximity(
  parkLat: number,
  parkLng: number,
  shelterLat: number,
  shelterLng: number,
): Omit<ShelterProximityResult, 'shelter'> {
  const distanceMeters = calculateDistance(parkLat, parkLng, shelterLat, shelterLng);
  const walkingTimeSeconds = distanceMeters / WALKING_SPEED_MS;
  const emergencyTimeSeconds = distanceMeters / EMERGENCY_SPEED_MS;

  return {
    distanceMeters,
    walkingTimeSeconds,
    walkingTimeMinutes: Math.ceil(walkingTimeSeconds / 60),
    emergencyTimeSeconds,
  };
}

/**
 * Find the nearest shelter to a given park from a list of shelter locations.
 * Shelters are parks/locations with `featureTags` containing `'safe_zone'`.
 */
export function findNearestShelter(
  park: Park,
  allParks: Park[],
): ShelterProximityResult | null {
  const shelters = allParks.filter(
    (p) => p.id !== park.id && p.featureTags?.includes('safe_zone'),
  );

  if (shelters.length === 0) return null;

  let nearest: ShelterProximityResult | null = null;

  for (const shelter of shelters) {
    const prox = computeProximity(
      park.location.lat,
      park.location.lng,
      shelter.location.lat,
      shelter.location.lng,
    );

    if (!nearest || prox.distanceMeters < nearest.distanceMeters) {
      nearest = { ...prox, shelter };
    }
  }

  return nearest;
}

/**
 * Decide whether the "nearby shelter" tag should be displayed for a park.
 *
 * Rules:
 *  1. `authority.isShelterDisplayEnabled` must be true
 *  2. Walking time must be ≤ `authority.maxShelterWalkingMinutes` (default 10)
 *  3. (Optional) Emergency time must be ≤ `authority.defenseTimeSeconds` if set
 */
export function shouldShowShelterTag(
  park: Park,
  allParks: Park[],
  authority: Authority | null | undefined,
): ShelterDisplayDecision {
  if (!authority?.isShelterDisplayEnabled) {
    return { show: false, proximity: null, reason: 'authority_disabled' };
  }

  const proximity = findNearestShelter(park, allParks);
  if (!proximity) {
    return { show: false, proximity: null, reason: 'no_shelter_found' };
  }

  const maxMinutes = authority.maxShelterWalkingMinutes ?? DEFAULT_MAX_WALKING_MINUTES;
  if (proximity.walkingTimeMinutes > maxMinutes) {
    return {
      show: false,
      proximity,
      reason: `walking_${proximity.walkingTimeMinutes}min_exceeds_${maxMinutes}min`,
    };
  }

  if (
    authority.defenseTimeSeconds &&
    proximity.emergencyTimeSeconds > authority.defenseTimeSeconds
  ) {
    return {
      show: false,
      proximity,
      reason: `emergency_${Math.ceil(proximity.emergencyTimeSeconds)}s_exceeds_${authority.defenseTimeSeconds}s`,
    };
  }

  return { show: true, proximity };
}

/**
 * Format the shelter tag label for display.
 * Example: "🛡️ מיגונית קרובה (כ-3 דקות הליכה)"
 */
export function formatShelterTagLabel(walkingMinutes: number): string {
  return `🛡️ מיגונית קרובה (כ-${walkingMinutes} דקות הליכה)`;
}
