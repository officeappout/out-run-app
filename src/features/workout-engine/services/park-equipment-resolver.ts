/**
 * Park Equipment Resolver
 *
 * Resolves the canonical equipment IDs available at the user's current park
 * using a priority chain:
 *   1. Explicitly selected park (`selectedParkId`)
 *   2. GPS position — nearest park within 1 000 m (detectNearbyPark with equipment radius)
 *   3. Profile fallback — `userProfile.firstWorkoutParkId` (set once at onboarding)
 *   4. Empty array → triggers ESSENTIAL_PARK_GEAR catastrophic fallback in pipeline
 *
 * All returned IDs are normalised through `normalizeGearId` so the pipeline
 * receives canonical keys (e.g. Firestore doc ID → 'rings', 'trx', etc.).
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { getPark } from '@/features/parks/core/services/parks.service';
import { detectNearbyPark, EQUIPMENT_DETECTION_RADIUS_M } from './park-detection.service';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

export interface ResolveParkEquipmentOptions {
  /** Explicitly selected park ID (e.g. from a map picker or settings) */
  selectedParkId?: string;
  /** User's current GPS coordinates, if available */
  gpsCoords?: { lat: number; lng: number };
}

/**
 * Extract and normalise equipment IDs from a park document.
 * Returns [] if the park has no gymEquipment array.
 */
async function extractParkEquipment(parkId: string): Promise<string[]> {
  try {
    const park = await getPark(parkId);
    if (!park?.gymEquipment?.length) return [];
    return park.gymEquipment.map((eq) => normalizeGearId(eq.equipmentId));
  } catch (err) {
    console.warn(`[ParkEquipmentResolver] Failed to fetch park "${parkId}":`, err);
    return [];
  }
}

/**
 * Resolve the equipment IDs available at the user's current park.
 *
 * Priority:
 *   1. selectedParkId (explicit override)
 *   2. GPS-detected nearby park (within 1 000 m — equipment resolution radius)
 *   3. profile.firstWorkoutParkId (onboarding fallback)
 *   4. [] — pipeline will use ESSENTIAL_PARK_GEAR as catastrophic fallback
 */
export async function resolveParkEquipmentIds(
  userProfile: UserFullProfile,
  options?: ResolveParkEquipmentOptions,
): Promise<string[]> {
  // Priority 1 — explicitly selected park
  if (options?.selectedParkId) {
    const ids = await extractParkEquipment(options.selectedParkId);
    if (ids.length > 0) {
      console.log(
        `[ParkEquipmentResolver] Selected park "${options.selectedParkId}": [${ids.join(', ')}]`,
      );
      return ids;
    }
  }

  // Priority 2 — GPS-detected park within 1 000 m (equipment-resolution radius).
  // This wider radius covers specialised parks (rings, TRX, etc.) within a
  // ~15-minute walking distance.  Session-tagging still uses the tighter 200 m
  // default radius so a workout is only tagged once the user is actually at the park.
  if (options?.gpsCoords?.lat && options?.gpsCoords?.lng) {
    try {
      const detected = await detectNearbyPark(
        options.gpsCoords.lat,
        options.gpsCoords.lng,
        EQUIPMENT_DETECTION_RADIUS_M,
      );
      if (detected?.parkId) {
        const ids = await extractParkEquipment(detected.parkId);
        if (ids.length > 0) {
          console.log(
            `[ParkEquipmentResolver] GPS-detected park "${detected.parkName}" (${detected.parkId}): [${ids.join(', ')}]`,
          );
          return ids;
        }
      }
    } catch (err) {
      console.warn('[ParkEquipmentResolver] GPS detection failed:', err);
    }
  }

  // Priority 3 — onboarding park fallback
  const fallbackParkId = userProfile.firstWorkoutParkId;
  if (fallbackParkId) {
    const ids = await extractParkEquipment(fallbackParkId);
    if (ids.length > 0) {
      console.log(
        `[ParkEquipmentResolver] Profile fallback park "${fallbackParkId}": [${ids.join(', ')}]`,
      );
      return ids;
    }
  }

  // Priority 4 — no park resolved; pipeline uses ESSENTIAL_PARK_GEAR
  console.log('[ParkEquipmentResolver] No park resolved — pipeline will use ESSENTIAL_PARK_GEAR fallback');
  return [];
}
