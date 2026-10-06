/**
 * Entry-router geo checks — "is there real content in this user's area" for
 * the onboarding tutorial's Gate 2 (scheduling-capability-audit.md's
 * recommendation, built now for the tutorial entry router).
 *
 * Deliberately thin wrappers around EXISTING data fetches, not a new query
 * shape — "never an empty screen" means these must answer the SAME question
 * home/map already answer correctly (post-#150/#153), not a parallel one:
 *   - gardens: fetchRealParks() + the hasUsableEquipment/isPrimaryFitness
 *     predicates from park-fitness.util.ts (the #150 fix) + GPS distance,
 *     same shape as useNearbyParks.ts.
 *   - routes: getCachedOfficialRoutes() + isRouteNearby(), same shape as
 *     useRouteGeneration.ts's "nearby official routes" path.
 *
 * Both are plain data checks — no map/nav UI files (DiscoverLayer.tsx,
 * MapShell.tsx) are imported or touched here; those stay David's.
 */

import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { hasUsableEquipment, isPrimaryFitness } from '@/features/workout-engine/hybrid/park-fitness.util';
import { getCachedOfficialRoutes } from '@/features/parks/core/services/inventory.service';
import { isRouteNearby } from '@/features/parks/core/services/geoUtils';
import { calculateDistance } from '@/lib/services/location.service';
import type { GPSCoords } from '@/features/parks/core/store/useGPSStore';

/** Same "nearby" radius useNearbyParks.ts already uses for the home park list. */
const GARDEN_RADIUS_M = 2000;

/** True if at least one real, primary-fitness equipped park is within range. */
export async function hasNearbyGardens(coords: GPSCoords): Promise<boolean> {
  try {
    const parks = await fetchRealParks();
    return parks.some((p) => {
      if (p.location?.lat == null || p.location?.lng == null) return false;
      if (!hasUsableEquipment(p) || !isPrimaryFitness(p)) return false;
      return calculateDistance(coords.lat, coords.lng, p.location.lat, p.location.lng) <= GARDEN_RADIUS_M;
    });
  } catch {
    // A failed fetch must never fabricate "gardens nearby" — fall through
    // to the caller's next gate rather than claim content that may not exist.
    return false;
  }
}

/** True if at least one published official route is within isRouteNearby's own default radius. */
export async function hasNearbyPreparedRoutes(coords: GPSCoords): Promise<boolean> {
  try {
    const routes = await getCachedOfficialRoutes();
    return routes.some((r) => isRouteNearby(r, coords));
  } catch {
    return false;
  }
}
