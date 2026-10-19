/**
 * useRouteRunV2Store — the route run's elevation samples aligned to the
 * session's own (possibly loop-rotated) path, for the v2 elevation-ahead strip
 * (enable_home_v2). null = the route has no samples → the strip is hidden.
 *
 * Written only by RouteRunLiveV2Controller (mounted by MapShell, flag-gated);
 * read by NavBannerV2 (and any live sheet that slots RouteElevationAhead).
 * Session-scoped UI state — nothing is persisted.
 *
 * Deliberately NO off-route state: the owner's 24.09.2026 rule (no deviation
 * alert at any distance, no recompute-on-deviation) stands.
 */

import { create } from 'zustand';
import type { ElevationSamples } from '../lib/route-elevation-ahead';

export interface RouteRunV2State {
  elevation: ElevationSamples | null;
  setElevation: (s: ElevationSamples | null) => void;
}

export const useRouteRunV2Store = create<RouteRunV2State>((set) => ({
  elevation: null,
  setElevation: (elevation) => set({ elevation }),
}));
