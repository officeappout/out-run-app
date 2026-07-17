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

import { getPark, fetchRealParks } from '@/features/parks/core/services/parks.service';
import { detectNearbyPark, EQUIPMENT_DETECTION_RADIUS_M } from './park-detection.service';
import { equippedParksWithin } from '../hybrid/park-out-and-back';
import { normalizeGearId, ensureEquipmentCachesLoaded } from '../shared/utils/gear-mapping.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/** Coverage-aware park scan radius (metres) — ~2 km covers specialised parks. */
const EQUIPPED_PARK_RADIUS_M = 2_000;
/** Perf cap: only probe the N nearest equipped parks (David's refinement). */
const MAX_PARK_CANDIDATES = 5;

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
  // Warm the equipment caches BEFORE any normalizeGearId call. This is the
  // resolver's contract (see park-equipment.util.ts): a park's gymEquipment
  // entries are Firestore doc-IDs that only translate to canonical gear types
  // (dip_station, pullup_bar, trx…) once `gymEquipmentCache` is seeded. Without
  // this, an early caller (StatsOverview resolves park gear BEFORE its own
  // ensureEquipmentCachesLoaded await) gets RAW doc-IDs back → ParkGating blocks
  // every geared exercise → the park looks empty and degrades to bodyweight.
  // Idempotent + deduped: a no-op once warm.
  await ensureEquipmentCachesLoaded();

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

  // Priority 2 — GPS-resolved park equipment.
  if (options?.gpsCoords?.lat && options?.gpsCoords?.lng) {
    if (CONTEXT_AWARE_SELECTION_ENABLED) {
      // Coverage-aware: scan EQUIPPED parks within 2 km, NEAREST-FIRST, and take the
      // nearest one that actually carries equipment. This stops a nearer UN-equipped
      // park from shadowing a farther equipped one — the root of the false
      // ESSENTIAL_PARK_GEAR fallback. Session-tagging still uses detectNearbyPark's
      // tight 200 m radius (a workout is only tagged once the user is AT the park).
      try {
        const parks = await fetchRealParks();
        const equipped = equippedParksWithin(options.gpsCoords, parks, EQUIPPED_PARK_RADIUS_M);
        for (const park of equipped.slice(0, MAX_PARK_CANDIDATES)) {
          const ids = (park.gymEquipment ?? [])
            .map((eq) => normalizeGearId(eq.equipmentId))
            .filter(Boolean);
          if (ids.length > 0) {
            console.log(
              `[ParkEquipmentResolver] Nearest equipped park "${park.name}" (${park.id}): [${ids.join(', ')}]`,
            );
            return ids;
          }
        }
        console.log('[ParkEquipmentResolver] No equipped park within 2 km of the GPS fix');
      } catch (err) {
        console.warn('[ParkEquipmentResolver] Equipped-park scan failed:', err);
      }
    } else {
      // Legacy distance-only path: single nearest park within 1 000 m.
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
