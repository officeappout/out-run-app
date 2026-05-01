import { create } from 'zustand';
import { MapFacility, FacilityType } from '../types/facility.types';
import { Park } from '../types/park.types';
import type { Route } from '../types/route.types';
import type { WalkStep } from '../hooks/useWalkToRoute';

export type LayerType = 'parks' | 'routes' | 'water' | 'toilet' | 'gym';

export type PartnerActivityFilter = 'all' | 'strength' | 'running' | 'walking';

export interface MapDeepLinkIntent {
  type: 'park' | 'route';
  targetId: string;
  sessionId?: string;
  source: 'home_workout' | 'notification' | 'share_link' | 'partners_drawer';
}

/** Global sheet overlay — renderable on any screen without navigating to /map */
export type GlobalSheetState =
  | { type: 'park'; park: Park }
  | { type: 'route'; route: Route }
  | null;

interface MapStore {
  selectedFacilityType: FacilityType | null;
  facilities: MapFacility[];
  selectedPark: Park | null;
  visibleLayers: LayerType[];
  pendingDeepLink: MapDeepLinkIntent | null;
  /** Global detail sheet overlay (works on any page) */
  globalSheet: GlobalSheetState;
  /**
   * Count of currently-mounted components requesting the global BottomNavbar
   * be hidden (e.g. the map's PlannedPreview / Navigate / Builder layers,
   * whose own bottom-anchored CTA cards would otherwise overlap with the
   * floating navbar). Stored as a counter — not a boolean — so concurrent
   * suppressors don't fight each other on mount/unmount races.
   */
  bottomNavSuppressionCount: number;
  /**
   * Active partner-finder activity filter — drives which partner markers
   * the map renders while the partner overlay is open. `'all'` shows
   * every partner.
   */
  partnerActivityFilter: PartnerActivityFilter;
  /**
   * Master visibility toggle for live partner markers on the map. Distinct
   * from `partnerActivityFilter`: this controls whether ANY partner pins
   * are drawn at all, regardless of which activity is selected. Default
   * `false` so the base map stays clean for users who never open the
   * partner finder. Flipped to `true` when:
   *   - The PartnerOverlay mounts (user explicitly opened the finder)
   *   - The "משתמשים פעילים" row in MapLayersControl applies a filter
   * Never auto-resets — once enabled it stays on for the session.
   */
  liveUsersVisible: boolean;
  /**
   * Cross-screen handoff for "open the partner overlay on /map".
   * Set by entry-points outside the map (e.g. WorkoutPreviewDrawer) just
   * before navigating with `router.push('/map')`. Consumed exactly once
   * by `DiscoverLayer` on mount, mirroring the `pendingDeepLink` pattern
   * so navigation cannot leave a stale intent behind.
   *
   * Activity prefilter is intentionally NOT included here — callers
   * should set it directly on `usePartnerFilters` (single source of
   * truth) so the overlay reads it the same way regardless of how it
   * was opened.
   */
  pendingPartnerOverlay: { tab: 'live' | 'scheduled' } | null;
  setSelectedFacilityType: (type: FacilityType | null) => void;
  setFacilities: (facilities: MapFacility[]) => void;
  setSelectedPark: (park: Park | null) => void;
  toggleLayer: (layer: LayerType) => void;
  setDeepLink: (intent: MapDeepLinkIntent) => void;
  consumeDeepLink: () => MapDeepLinkIntent | null;
  openGlobalParkSheet: (park: Park) => void;
  openGlobalRouteSheet: (route: Route) => void;
  closeGlobalSheet: () => void;
  /** Increment the suppression counter — pair with `releaseBottomNav()`. */
  suppressBottomNav: () => void;
  /** Decrement the suppression counter (clamped at 0). */
  releaseBottomNav: () => void;
  setPartnerActivityFilter: (filter: PartnerActivityFilter) => void;
  setLiveUsersVisible: (v: boolean) => void;
  setPendingPartnerOverlay: (intent: { tab: 'live' | 'scheduled' } | null) => void;
  consumePendingPartnerOverlay: () => { tab: 'live' | 'scheduled' } | null;
  /** Walking minutes from user to the currently-focused route's nearest endpoint. */
  walkToRouteMinutes: number | null;
  setWalkToRouteMinutes: (minutes: number | null) => void;
  /**
   * Imperative camera target written by TurnCarousel when the user swipes to
   * a new turn card. AppMap consumes this once (flies the camera, then clears
   * it) so the carousel never needs direct access to the Mapbox map instance.
   *
   * Two camera modes:
   *   • `flyTo`     — center on a single point with a heading (default for
   *                   simple peek-ahead-one-turn).
   *   • `fitBounds` — frame the *segment* between the user's current position
   *                   and the swiped turn so the user genuinely *previews*
   *                   the upcoming leg, not just the turn vertex. Used when
   *                   the carousel can supply both endpoints.
   */
  turnFlyToTarget:
    | {
        kind: 'flyTo';
        center: [number, number];
        bearing: number;
      }
    | {
        kind: 'fitBounds';
        bounds: [[number, number], [number, number]]; // [SW, NE]
        bearing: number;
      }
    | null;
  setTurnFlyToTarget: (target: MapStore['turnFlyToTarget']) => void;
  /**
   * Pre-composed Hebrew turn-by-turn list for the walk leg, mirrored
   * from `useWalkToRoute` so any consumer (e.g. RouteDetailSheet's
   * timeline accordion) can render the steps without re-running the
   * Mapbox Directions request. Cleared in lockstep with
   * `walkToRouteMinutes`.
   */
  walkSteps: WalkStep[] | null;
  setWalkSteps: (steps: WalkStep[] | null) => void;
  /**
   * Live position of the metrics card during an active running session.
   * Written by `useDraggableMetrics` on every snap, read by
   * `useCameraController` to compute adaptive map-padding so the user's
   * blue dot is never obscured by the card.
   *
   * Decoupled via store (rather than prop-drilled through MapShell →
   * AppMap → useCameraController) so the camera doesn't depend on any
   * workout-engine-side React tree being mounted. When no running
   * session is active this stays at `'top'` and the camera defaults
   * to the standard Waze padding.
   */
  metricsCardPosition: 'top' | 'bottom';
  setMetricsCardPosition: (pos: 'top' | 'bottom') => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  selectedFacilityType: null,
  facilities: [],
  selectedPark: null,
  visibleLayers: ['parks', 'routes', 'gym'],
  pendingDeepLink: null,
  globalSheet: null,
  bottomNavSuppressionCount: 0,
  partnerActivityFilter: 'all',
  liveUsersVisible: false,
  pendingPartnerOverlay: null,
  walkToRouteMinutes: null,
  walkSteps: null,
  turnFlyToTarget: null,
  setSelectedFacilityType: (type) => set({ selectedFacilityType: type }),
  setFacilities: (facilities) => set({ facilities }),
  setSelectedPark: (park) => set({ selectedPark: park }),
  toggleLayer: (layer) => set((state) => {
    if (state.visibleLayers.includes(layer)) {
      return { visibleLayers: state.visibleLayers.filter((l) => l !== layer) };
    }
    return { visibleLayers: [...state.visibleLayers, layer] };
  }),
  setDeepLink: (intent) => set({ pendingDeepLink: intent }),
  consumeDeepLink: () => {
    const current = get().pendingDeepLink;
    if (current) set({ pendingDeepLink: null });
    return current;
  },
  openGlobalParkSheet: (park) => set({ globalSheet: { type: 'park', park }, selectedPark: park }),
  openGlobalRouteSheet: (route) => set({ globalSheet: { type: 'route', route } }),
  closeGlobalSheet: () => set({ globalSheet: null }),
  suppressBottomNav: () =>
    set((s) => ({ bottomNavSuppressionCount: s.bottomNavSuppressionCount + 1 })),
  releaseBottomNav: () =>
    set((s) => ({
      bottomNavSuppressionCount: Math.max(0, s.bottomNavSuppressionCount - 1),
    })),
  setPartnerActivityFilter: (filter) => set({ partnerActivityFilter: filter }),
  setLiveUsersVisible: (v) => set({ liveUsersVisible: v }),
  setPendingPartnerOverlay: (intent) => set({ pendingPartnerOverlay: intent }),
  consumePendingPartnerOverlay: () => {
    const current = get().pendingPartnerOverlay;
    if (current) set({ pendingPartnerOverlay: null });
    return current;
  },
  setWalkToRouteMinutes: (minutes) => set({ walkToRouteMinutes: minutes }),
  setWalkSteps: (steps) => set({ walkSteps: steps }),
  setTurnFlyToTarget: (target) => set({ turnFlyToTarget: target }),
  metricsCardPosition: 'top',
  setMetricsCardPosition: (pos) => set({ metricsCardPosition: pos }),
}));
