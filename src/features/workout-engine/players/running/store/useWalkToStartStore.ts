'use client';
/**
 * The route a walk-to-the-start leads to (enable_combo_flow_v1, boards PlayerArrive /
 * PlayerWalkRoute, owner-approved 31.10.2026): set when "navigate to the start" begins, so on
 * arrival the SAME session continues on the route (one workout, not a commute + a route). In
 * memory only; cleared when the session continues, or when any other commute starts.
 */
import { create } from 'zustand';
import type { Route } from '@/features/parks/core/types/route.types';

interface WalkToStartState {
  route: Route | null;
  setRoute: (r: Route | null) => void;
}

export const useWalkToStartStore = create<WalkToStartState>((set) => ({
  route: null,
  setRoute: (route) => set({ route }),
}));

/** The route's length in km, when the route has a numeric one. */
export function routeKmOf(r: Pick<Route, 'distance'> | null | undefined): number | null {
  const d = (r as { distance?: unknown } | null | undefined)?.distance;
  return typeof d === 'number' && d > 0 ? d : null;
}

/**
 * Turn the live commute into the route, in place: the same session keeps its time / distance /
 * laps (one saved workout). The caller focuses the route on the map.
 */
export async function continueCommuteOnRoute(route: Route, activity: 'walking' | 'running'): Promise<void> {
  const { useRunningPlayer } = await import('./useRunningPlayer');
  const rp = useRunningPlayer.getState();
  rp.clearCommuteContext();
  rp.setActivityType(activity);
  rp.setGuidedRouteId(route.id ?? null);
  rp.setGuidedRouteName(route.name ?? null);
  rp.setGuidedRouteDistanceKm(routeKmOf(route));
  useWalkToStartStore.getState().setRoute(null);
}
