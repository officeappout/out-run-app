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
   * are drawn at all, regardless of which activity is selected.
   *
   * Default `true` so two logged-in users who both open the map can see
   * each other immediately, without needing to discover the layers panel
   * first. Previously defaulted to `false`, which combined with the
   * `useGroupPresence` "no idle users" filter to make presence invisible
   * by default — exactly the "Device A and Device B can't see each
   * other" symptom we were fixing.
   *
   * Still flipped to `true` explicitly when:
   *   - The PartnerOverlay mounts (user explicitly opened the finder)
   *   - The "משתמשים פעילים" row in MapLayersControl applies a filter
   * Users who want a clean map can toggle it off via the layers panel;
   * once changed it stays for the session.
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
  /**
   * Rendered height (px) of TurnCarousel. Written by TurnCarousel via a
   * ResizeObserver and reset to 0 on unmount. Used by useDraggableMetrics
   * to position the metrics card's top snap dynamically below the nav card.
   */
  navCardHeight: number;
  setNavCardHeight: (h: number) => void;
  /**
   * Rendered height (px) of the floating RouteStoryBar. Written by
   * FreeRunActive via a ResizeObserver and reset to 0 on unmount. Used by
   * TurnCarousel to position itself directly BELOW the bar so the bar is
   * never occluded by the navigation cards.
   */
  storyBarHeight: number;
  setStoryBarHeight: (h: number) => void;
  /**
   * Index of the currently-selected turn card in TurnCarousel. Written by
   * TurnCarousel whenever the user swipes (or GPS auto-advances) to a new
   * card. Read by AppMap to render the ground arrow icon ONLY at the
   * active turn's coordinates, not for the whole route. -1 = no selection.
   */
  activeTurnIdx: number;
  setActiveTurnIdx: (i: number) => void;
  /**
   * Generated routes currently displayed in the free-run RouteCarousel.
   *
   * Written by RouteCarousel as soon as `generateDynamicRoutes` resolves so
   * MapShell can pipe the list into AppMap's `routes` prop and the user
   * sees all swipeable polylines on the map (NOT just the focused one).
   * Cleared on RouteCarousel unmount so the map returns to its default
   * mode-based source after the user starts a workout, taps back to the
   * config drawer, or exits free-run entirely.
   *
   * `null` = no override, MapShell uses its standard `routesToDisplay`
   * pipeline; non-null array (even empty) = override the map source.
   */
  freeRunCarouselRoutes: Route[] | null;
  setFreeRunCarouselRoutes: (routes: Route[] | null) => void;
  /**
   * Currently-active commute destination — set when the user picks a
   * generic address from search (or taps a Home/Work shortcut) and the
   * commute RouteCarousel mounts. Stored as `[lng, lat]` to match the
   * Mapbox-native ordering used by SearchSuggestion / SavedPlace, so
   * the data flows end-to-end without coordinate-order swaps.
   *
   * Cleared when the user backs out of the commute carousel or starts
   * a workout. AppMap subscribes to this to render the premium
   * destination pin (DestinationMarker) at the chosen point.
   *
   * `null` = no commute in flight; non-null = an A-to-B target is
   * pinned and the destination marker should be visible.
   */
  commuteDestination: { coords: [number, number]; label?: string } | null;
  setCommuteDestination: (
    target: { coords: [number, number]; label?: string } | null,
  ) => void;
  /**
   * One-shot commute request. Written by entity cards (ParkPreview /
   * RouteDetailSheet "Navigate" buttons) when the user wants to commute
   * to a park or route start. DiscoverLayer subscribes and consumes in
   * a useEffect — same pattern as `pendingPartnerOverlay` /
   * `pendingDeepLink` so the request can't get re-fired across renders.
   *
   * Decoupled via the store (rather than a prop callback) because
   * entity cards are mounted globally — they don't have a parent that
   * owns the local `mapMode` state.
   */
  pendingCommute: { coords: [number, number]; label?: string } | null;
  setPendingCommute: (
    target: { coords: [number, number]; label?: string } | null,
  ) => void;
  consumePendingCommute: () => { coords: [number, number]; label?: string } | null;
  /**
   * Monotonic counter that AppMap bumps whenever a click on the Mapbox
   * canvas falls through every interactive layer (no park / route /
   * pin / facility hit). Acts as a one-shot signal for "the user
   * tapped empty map" without coupling AppMap to the route / commute
   * state machines.
   *
   * Subscribers (e.g. DiscoverLayer's commute branch) react in a
   * useEffect and decide what to do based on their local context —
   * commute mode treats it as "exit and clear destination", other
   * modes can ignore it. We use a counter rather than a boolean
   * because two empty taps in a row would otherwise look identical
   * to React and miss the second event.
   */
  mapEmptyTapTick: number;
  bumpMapEmptyTapTick: () => void;
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
  liveUsersVisible: true,
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
  navCardHeight: 0,
  setNavCardHeight: (h) => set({ navCardHeight: h }),
  storyBarHeight: 0,
  setStoryBarHeight: (h) => set({ storyBarHeight: h }),
  activeTurnIdx: -1,
  setActiveTurnIdx: (i) => set({ activeTurnIdx: i }),
  freeRunCarouselRoutes: null,
  setFreeRunCarouselRoutes: (routes) => set({ freeRunCarouselRoutes: routes }),
  commuteDestination: null,
  setCommuteDestination: (target) => set({ commuteDestination: target }),
  pendingCommute: null,
  setPendingCommute: (target) => set({ pendingCommute: target }),
  consumePendingCommute: () => {
    const current = get().pendingCommute;
    if (current) set({ pendingCommute: null });
    return current;
  },
  mapEmptyTapTick: 0,
  bumpMapEmptyTapTick: () => set((s) => ({ mapEmptyTapTick: s.mapEmptyTapTick + 1 })),
}));
