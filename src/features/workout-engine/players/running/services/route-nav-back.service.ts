/**
 * route-nav-back — "נווט חזרה" for a guided route run (home v2): one walking
 * path from the user to the nearest point on the route, through the existing
 * Mapbox Directions wrapper (MapboxService.getSmartPath — the same call
 * useWalkToRoute makes for the walk TO a route). One request per tap; a new
 * tap cancels the previous one. Never re-plans the route itself.
 */

import { MapboxService } from '@/features/parks/core/services/mapbox.service';
import { withCancelPrevious } from '@/lib/requestGovernor';

export async function fetchNavBackPath(
  from: { lat: number; lng: number },
  to: [number, number],
): Promise<[number, number][] | null> {
  try {
    const result = await withCancelPrevious('route-run-nav-back', (signal) =>
      MapboxService.getSmartPath(
        { lng: from.lng, lat: from.lat },
        { lng: to[0], lat: to[1] },
        'walking',
        [],
        {},
        { signal },
      ),
    );
    if (!result || !Array.isArray(result.path) || result.path.length < 2) return null;
    return result.path;
  } catch {
    return null;
  }
}
