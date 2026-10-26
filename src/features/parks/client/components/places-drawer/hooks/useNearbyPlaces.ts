'use client';

/**
 * useNearbyPlaces — the places within walking range of the user (enable_map_places_drawer_v1).
 *
 * Reads only the caches the map already fills: the park catalog (fetchRealParks — IndexedDB +
 * ETag, shared with the map's markers) and the per-session official routes cache
 * (getCachedOfficialRoutes). Both are loaded once per mount; the ranking is pure and re-runs only
 * when the user moves ~100 m (coarse key), never on every GPS tick.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { buildNearbyPlaces, type NearbyPlace } from '../nearby-places';

export interface NearbyPlacesResult {
  places: NearbyPlace[];
  loading: boolean;
}

export function useNearbyPlaces(enabled: boolean, origin: { lat: number; lng: number } | null): NearbyPlacesResult {
  const [data, setData] = useState<{ parks: Park[]; routes: Route[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([
      import('@/features/parks/core/services/parks.service').then((m) => m.fetchRealParks()).catch(() => [] as Park[]),
      import('@/features/parks/core/services/inventory.service').then((m) => m.getCachedOfficialRoutes()).catch(() => [] as Route[]),
    ]).then(([parks, routes]) => { if (alive) setData({ parks, routes }); });
    return () => { alive = false; };
  }, [enabled]);

  const posKey = origin ? `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}` : null;
  const places = useMemo(() => {
    if (!data || !origin) return [];
    return buildNearbyPlaces(data.parks, data.routes, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, posKey]);

  return { places, loading: enabled && data === null };
}
