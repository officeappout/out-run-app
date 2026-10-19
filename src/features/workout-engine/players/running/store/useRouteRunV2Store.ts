/**
 * useRouteRunV2Store — live state for a guided route run's v2 extras
 * (enable_home_v2): off-route status, the user's "navigate back / continue
 * free" choice, the navigate-back walking line, and the route's elevation
 * samples (when the route doc has any — none do today).
 *
 * Written only by RouteRunLiveV2Controller (mounted by MapShell next to
 * TurnCarousel, flag-gated) and the OffRouteChoiceCard buttons. Read by
 * NavBannerV2, TurnCarousel (state only), the toast and the map layer.
 * Everything here is session-scoped UI state — nothing is persisted.
 */

import { create } from 'zustand';
import type { ElevationSamples } from '../lib/route-elevation-ahead';

export type NavBackStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RouteRunV2State {
  /** Off-route detector says the user left the route (enter >40 m for >10 s, exit <20 m). */
  offRoute: boolean;
  /** Live cross-track distance to the route (m), while off-route. */
  offRouteDistanceM: number | null;
  /** Nearest point on the route ([lng, lat]) — the navigate-back target. */
  rejoinPoint: [number, number] | null;
  /** Bumped on every off-route ENTRY (drives the one-shot toast). */
  offRouteToken: number;
  /** "המשך חופשי": guidance dropped for the rest of the session; recording continues. */
  guidanceDropped: boolean;
  navBackStatus: NavBackStatus;
  /** Walking line user → rejoinPoint (Mapbox Directions), [lng, lat][]. */
  navBackPath: [number, number][] | null;
  /** Elevation profile aligned to the session's path; null = no samples (strip hidden). */
  elevation: ElevationSamples | null;

  setOffRoute: (offRoute: boolean, distanceM: number | null, rejoinPoint: [number, number] | null) => void;
  dropGuidance: () => void;
  setNavBack: (status: NavBackStatus, path?: [number, number][] | null) => void;
  setElevation: (s: ElevationSamples | null) => void;
  reset: () => void;
}

const INITIAL = {
  offRoute: false,
  offRouteDistanceM: null,
  rejoinPoint: null,
  offRouteToken: 0,
  guidanceDropped: false,
  navBackStatus: 'idle' as NavBackStatus,
  navBackPath: null,
  elevation: null,
};

export const useRouteRunV2Store = create<RouteRunV2State>((set, get) => ({
  ...INITIAL,
  setOffRoute: (offRoute, distanceM, rejoinPoint) => {
    const prev = get();
    if (offRoute && !prev.offRoute) {
      set({ offRoute, offRouteDistanceM: distanceM, rejoinPoint, offRouteToken: prev.offRouteToken + 1 });
    } else if (!offRoute && prev.offRoute) {
      // Back on the route: the navigate-back line has done its job.
      set({ offRoute, offRouteDistanceM: null, rejoinPoint: null, navBackStatus: 'idle', navBackPath: null });
    } else if (offRoute) {
      set({ offRouteDistanceM: distanceM, rejoinPoint });
    }
  },
  dropGuidance: () => set({
    guidanceDropped: true, offRoute: false, offRouteDistanceM: null, rejoinPoint: null,
    navBackStatus: 'idle', navBackPath: null,
  }),
  setNavBack: (status, path = null) => set({ navBackStatus: status, navBackPath: path }),
  setElevation: (elevation) => set({ elevation }),
  // Session-scoped reset; elevation is owned by its own effect (route-scoped) and kept.
  reset: () => set({ ...INITIAL, offRouteToken: get().offRouteToken, elevation: get().elevation }),
}));
