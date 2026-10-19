'use client';

/**
 * Map search quick chips (unified search flag): "גינות כושר" / "מסלולי ריצה" — the nearest 5 of
 * each, from the same cached lists the map search already loads. A chip is offered only when it
 * has data ("ברזיות" is not: the park catalog carries no water-fountain spots yet; "מוצל עכשיו"
 * waits for shade data). Picking a chip only swaps the empty state's "קרוב אליך" list — the
 * typed-results logic is untouched.
 */
import { useEffect, useState } from 'react';
import type { SearchSuggestion } from '@/features/parks/core/hooks/useSearchNavigation';
import { isFitnessGarden, loadParks, loadRoutes, nearestParks, nearestRoutes } from '../providers/places';

export type MapQuickChip = 'gyms' | 'routes';
export const MAP_QUICK_LABEL: Record<MapQuickChip, string> = { gyms: 'גינות כושר', routes: 'מסלולי ריצה' };

export function useMapQuickPlaces(enabled: boolean, pos: { lat: number; lng: number } | null | undefined) {
  const [lists, setLists] = useState<Record<MapQuickChip, SearchSuggestion[]>>({ gyms: [], routes: [] });
  const [active, setActive] = useState<MapQuickChip | null>(null);
  const lat = pos?.lat;
  const lng = pos?.lng;

  useEffect(() => {
    if (!enabled || lat == null || lng == null) return;
    let alive = true;
    const p = { lat, lng };
    Promise.all([loadParks().catch(() => []), loadRoutes().catch(() => [])]).then(([parks, routes]) => {
      if (!alive) return;
      const byId = new Map(parks.map((x) => [x.id, x]));
      const routeById = new Map(routes.map((r) => [r.id, r]));
      setLists({
        gyms: nearestParks(parks, p, 5, isFitnessGarden).map((h) => {
          const park = byId.get(h.id)!;
          return { text: park.name + (park.city ? ` · ${park.city}` : ''), coords: [park.location.lng, park.location.lat] as [number, number], _source: 'park' as const, _id: park.id };
        }),
        routes: nearestRoutes(routes, p, 5).map((h) => {
          const r = routeById.get(h.id)!;
          return { text: r.name + (r.city ? ` · ${r.city}` : ''), coords: r.path[0] as [number, number], _source: 'route' as const, _id: r.id, routeKm: typeof r.distance === 'number' ? r.distance : undefined };
        }),
      });
    });
    return () => { alive = false; };
  }, [enabled, lat, lng]);

  const available = (Object.keys(lists) as MapQuickChip[]).filter((k) => lists[k].length > 0);
  return {
    available,
    active: active && lists[active].length ? active : null,
    items: active ? lists[active] : [],
    toggle: (c: MapQuickChip) => setActive((cur) => (cur === c ? null : c)),
  };
}
