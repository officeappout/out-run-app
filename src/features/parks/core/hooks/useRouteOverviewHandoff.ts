'use client';

/**
 * The map's side of "a route opened outside the map" (enable_home_v2):
 * while mounted (v2), marks the route overview's host as up, and consumes
 * useMapStore.pendingRouteOverview — a fresh request calls `onOpen(route)`,
 * which selects + focuses it so the ONE route overview drawer opens.
 * GlobalDetailOverlay writes the request (see route-open-target.ts).
 * Flag off: does nothing.
 */

import { useEffect, useRef } from 'react';
import type { Route } from '../types/route.types';
import { useMapStore } from '../store/useMapStore';
import { isRouteOpenFresh } from '../utils/route-open-target';

export function useRouteOverviewHandoff(v2: boolean, onOpen: (route: Route) => void): void {
  const pending = useMapStore((s) => s.pendingRouteOverview);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!v2) return;
    const { setRouteOverviewHostMounted } = useMapStore.getState();
    setRouteOverviewHostMounted(true);
    return () => setRouteOverviewHostMounted(false);
  }, [v2]);

  useEffect(() => {
    if (!v2 || !pending) return;
    const req = useMapStore.getState().consumePendingRouteOverview();
    if (!req || !isRouteOpenFresh(req.at, Date.now())) return;
    onOpenRef.current(req.route);
  }, [v2, pending]);
}
