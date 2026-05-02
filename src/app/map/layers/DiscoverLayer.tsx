'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import FreeRunDrawer from '@/features/parks/core/components/FreeRunDrawer';
import ActivityCarousel from '@/features/parks/core/components/ActivityCarousel';
import RouteCarousel from '@/features/parks/core/components/RouteCarousel';
import FloatingSearchBar from '@/features/parks/core/components/FloatingSearchBar';
import SavedPlacesQuickRow from '@/features/parks/core/components/SavedPlacesQuickRow';
import MapModeHeader, { MapMode } from '@/features/parks/core/components/MapModeHeader';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { useMapLogic } from '@/features/parks';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { ParkPreview } from '@/features/parks/client/components/park-preview';
import RouteDetailSheet from '@/features/parks/client/components/route-preview/RouteDetailSheet';
import { MapLayersControl } from '@/features/parks/core/components/MapLayersControl';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
import SetSavedPlaceSheet from '@/features/user/places/components/SetSavedPlaceSheet';
import type { SavedPlace, SavedPlaceKind } from '@/features/user/places/store/useSavedPlacesStore';
import { useRecentSearchesStore } from '@/features/parks/core/store/useRecentSearchesStore';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import {
  PartnerBubbles,
  PartnerOverlay,
  RadarAnimation,
  usePartnerFilters,
  type LiveActivityFilter,
} from '@/features/partners';
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';
import MockLocationPanel from '@/features/dev/components/MockLocationPanel';
import { useCommunityEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import {
  Navigation,
  Plus, X, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type MapLogic = ReturnType<typeof useMapLogic>;

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';

function ActionSpeedDial({ onAdd, onReport }: { onAdd: () => void; onReport: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-center gap-2">
      {isOpen && (
        <>
          <button
            onClick={() => { onReport(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-amber-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="דיווח מהיר"
          >
            <Zap size={16} />
          </button>
          <button
            onClick={() => { onAdd(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-emerald-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="הוסף מיקום"
          >
            <Plus size={16} />
          </button>
        </>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white active:scale-95 transition-all"
      >
        {isOpen ? <X size={22} /> : <Plus size={22} />}
      </button>
    </div>
  );
}

interface DiscoverLayerProps {
  logic: MapLogic;
  flyoverComplete: boolean;
  devSim?: DevSimulationState;
}

export default function DiscoverLayer({ logic, flyoverComplete, devSim }: DiscoverLayerProps) {
  const { setMode } = useMapMode();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('idle');

  // ── Free-run flow state machine ────────────────────────────────────────────
  // Once `mapMode === 'freeRun'`, the user passes through three stages:
  //   1. 'activity' — floating ActivityCarousel over the map (pick run/walk/cycle)
  //   2. 'config'   — FreeRunDrawer (mode + goal + start CTA)
  //   3. 'route'    — floating RouteCarousel (3 generated route cards over
  //                    the map) — only entered if the user picks "with route"
  //                    mode in stage 2 and taps "Generate".
  //
  // Stage transitions:
  //   carousel card tap          → activity → config
  //   drawer "שנה פעילות" chip   → config   → activity
  //   drawer "Generate"          → config   → route   (with carousel-config payload)
  //   route carousel back chip   → route    → config
  //   route carousel "Start"     → route    → idle (workout starts)
  type FreeRunStep = 'activity' | 'config' | 'route';
  const [freeRunStep, setFreeRunStep] = useState<FreeRunStep>('activity');

  // Carousel-config payload — captured when the user taps "Generate" in the
  // drawer so the floating RouteCarousel knows what targetKm to feed into
  // `generateDynamicRoutes`. Stored in DiscoverLayer (not in the carousel
  // itself) so a back-and-forth via the back chip preserves the previous
  // generation context if the user re-enters route mode quickly.
  const [routeCarouselConfig, setRouteCarouselConfig] = useState<{
    targetKm: number;
    includeStrength: boolean;
    surface: 'road' | 'trail';
  } | null>(null);

  // Reset to the activity stage every time we re-enter free-run mode so a
  // back-and-forth between modes doesn't strand the user mid-config.
  useEffect(() => {
    if (mapMode === 'freeRun') {
      setFreeRunStep('activity');
      setRouteCarouselConfig(null);
    }
  }, [mapMode]);

  // ── Commute (A-to-B) flow state ───────────────────────────────────────────
  // `commuteRouteConfig` mirrors `routeCarouselConfig` for the commute
  // branch — it captures the destination + label needed to mount
  // RouteCarousel in commute mode. Stored at the layer level (not in
  // useMapStore) so a back-out gesture can clear it locally without
  // racing against any other consumer.
  const [commuteRouteConfig, setCommuteRouteConfig] = useState<{
    destination: { lat: number; lng: number };
    label?: string;
  } | null>(null);

  // ── Commute transport mode (per-session, NOT persisted) ────────────────
  // Daily commutes are activity-agnostic — someone running for fitness
  // in the morning might walk to work in the afternoon. We deliberately
  // do NOT seed this from `useUserStore.preferences.activity` (the
  // free-run default). Instead the commute always boots in 'walking',
  // which is the safest assumption for a navigation flow, and the user
  // taps the inline picker in RouteCarousel to swap mid-search. State
  // lives at the layer level so an entity-card → commute handoff
  // (Park "Navigate" button) starts on the same default and the user
  // gets a consistent UX regardless of how the commute was entered.
  const [commuteActivity, setCommuteActivity] = useState<ActivityType>('walking');

  // Reset the picker to 'walking' whenever a fresh commute begins, so
  // the previous session's choice doesn't bleed into the next one.
  useEffect(() => {
    if (commuteRouteConfig) setCommuteActivity('walking');
  }, [commuteRouteConfig?.destination.lat, commuteRouteConfig?.destination.lng]);

  // SetSavedPlaceSheet host state — null = closed, kind = open for that slot.
  const [setPlaceSheetKind, setSetPlaceSheetKind] = useState<SavedPlaceKind | null>(null);

  // Mirror the commute destination into useMapStore so AppMap can render
  // the destination pin without prop-drilling. SET-ONLY here — the
  // active session needs the pin to remain visible after the user
  // taps a route (mapMode flips back to 'idle'), and the workout
  // engine owns the canonical clear via `finishWorkout`. Explicit
  // user-cancel paths (back button / setCommuteRouteConfig(null) on
  // exit) clear the pin directly via setCommuteDestination(null) so
  // the back-out feels instant.
  useEffect(() => {
    if (mapMode === 'commute' && commuteRouteConfig) {
      useMapStore.getState().setCommuteDestination({
        coords: [commuteRouteConfig.destination.lng, commuteRouteConfig.destination.lat],
        label: commuteRouteConfig.label,
      });
    }
  }, [mapMode, commuteRouteConfig]);

  // ── Tap-empty-map → exit commute ──────────────────────────────────────
  // Field-test feedback: once a destination was picked, the only way
  // back was the small chevron in the carousel header. Users
  // expected the universal Maps gesture — tap empty map to dismiss.
  // AppMap bumps `mapEmptyTapTick` whenever a click misses every
  // interactive feature; we subscribe here and treat the bump as
  // "user is done, drop the commute". Other modes ignore the signal
  // entirely (handled by the conditional inside the effect).
  //
  // Implementation note: we read the tick reactively (not via
  // getState) so React re-runs the effect on every increment; the
  // effect-internal mode check is the gate.
  const mapEmptyTapTick = useMapStore((s) => s.mapEmptyTapTick);
  const lastEmptyTapTickRef = useRef(mapEmptyTapTick);
  useEffect(() => {
    if (mapEmptyTapTick === lastEmptyTapTickRef.current) return;
    lastEmptyTapTickRef.current = mapEmptyTapTick;
    if (mapMode !== 'commute') return;
    // Same teardown as the carousel's onBack — keeps the two exit
    // paths bit-identical so the user never lands in a half-state.
    logic.setFocusedRoute(null);
    setCommuteRouteConfig(null);
    useMapStore.getState().setCommuteDestination(null);
    setMapMode('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEmptyTapTick, mapMode]);

  // Pending-commute consumer. Entity cards (ParkPreview /
  // RouteDetailSheet) write to `useMapStore.pendingCommute` when the
  // user taps their Navigate button; we react here, kick off the
  // commute flow, and consume the slot in one go so it can't re-fire
  // on the next render. Same pattern as pendingPartnerOverlay /
  // pendingDeepLink.
  const pendingCommute = useMapStore((s) => s.pendingCommute);
  useEffect(() => {
    if (!pendingCommute) return;
    const target = useMapStore.getState().consumePendingCommute();
    if (!target) return;
    // Close any open entity card so the new commute carousel owns the
    // bottom of the screen (the carousel and entity card share the
    // mid-bottom area and would visually collide otherwise).
    useMapStore.getState().setSelectedPark(null);
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    setCommuteRouteConfig({
      destination: { lat: target.coords[1], lng: target.coords[0] },
      label: target.label,
    });
    setMapMode('commute');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommute]);

  // ── Partner Finder state machine ──────────────────────────────────────────
  // Three exclusive screens once mapMode === 'partners':
  //   bubbles → radar (transient) → overlay
  // `pendingTab` carries the user's tap intent across the radar interlude
  // so the overlay knows which tab to open with.
  const [partnerTab, setPartnerTab] = useState<'live' | 'scheduled' | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const [pendingTab, setPendingTab] = useState<'live' | 'scheduled' | null>(null);

  // ── Partner data — lifted here (single source of truth) so the same
  // listener set powers the bubble counts, the radar's `isCached` signal,
  // AND the overlay cards. PartnerOverlay no longer subscribes itself.
  //
  // `effectiveRadius` = user's requested distance from filters, then auto-
  // bumped to 15km when fewer than 3 results show up. The bump happens via
  // a state set inside the effect below, NOT inside `usePartnerData` itself,
  // so we get exactly one re-subscription cycle when expansion fires.
  const userLocation = (devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos) ?? null;
  const requestedDistanceKm = usePartnerFilters((s) => s.distanceKm);

  // Resolved city for the FreeRunDrawer route flow. Same hook that
  // useRouteGeneration consumes — keeps both code paths in sync. We pass
  // `userLocation` so the hook can fall back to a Mapbox reverse-geocode
  // when the user has neither a city affiliation nor an authorityId on
  // their profile (the most common gap for non-gateway entry points).
  const userCityName = useUserCityName(userLocation);

  const [effectiveRadius, setEffectiveRadius] = useState(requestedDistanceKm);

  // Reset the effective radius whenever the user explicitly changes the
  // filter — otherwise an earlier auto-bump would stick around forever.
  useEffect(() => {
    setEffectiveRadius(requestedDistanceKm);
  }, [requestedDistanceKm]);

  const { live, scheduled, isLoading } = usePartnerData(userLocation, effectiveRadius);

  useEffect(() => {
    const total = live.length + scheduled.length;
    const next = total < 3 && effectiveRadius < 15 ? 15 : effectiveRadius;
    if (next !== effectiveRadius) setEffectiveRadius(next);
  }, [live, scheduled, effectiveRadius]);

  // Reset partner sub-state whenever the user leaves the partners mode.
  useEffect(() => {
    if (mapMode !== 'partners') {
      setPartnerTab(null);
      setShowRadar(false);
      setPendingTab(null);
    }
  }, [mapMode]);

  const handleBubbleSelect = (tab: 'live' | 'scheduled') => {
    setPendingTab(tab);
    setShowRadar(true);
  };

  const handleRadarComplete = () => {
    setShowRadar(false);
    setPartnerTab(pendingTab);
    setPendingTab(null);
  };

  const handlePartnerOverlayClose = () => {
    setPartnerTab(null);
    setShowRadar(false);
    setPendingTab(null);
    setMapMode('idle');
  };

  // ── Continuous filter sync ──
  // Mirror `usePartnerFilters.liveActivity` → `useMapStore.partnerActivityFilter`
  // on every change so that map markers AND the heatmap re-filter in
  // real-time as the user taps pills inside PartnerOverlay or
  // PartnerFilterSheet. The previous mount-only `onFiltersChange` bridge
  // synced just once when the overlay opened, so subsequent pill taps
  // updated the partner-finder list but left the map in a stale state.
  // This effect subscribes to the store via React, so every `setLiveActivity`
  // call (from `PartnerFilterBar`, smart defaults, or anywhere else) reaches
  // the map store within the next render commit.
  const liveActivityFilter = usePartnerFilters((s) => s.liveActivity);
  useEffect(() => {
    useMapStore.getState().setPartnerActivityFilter(liveActivityFilter);
  }, [liveActivityFilter]);

  // Retained as a stable no-op identity so the existing `onFiltersChange`
  // prop signature on PartnerOverlay continues to compile. The continuous
  // sync above is now the source of truth — this callback is intentionally
  // empty and can be removed once the prop is dropped.
  const handlePartnerFiltersChange = useCallback((_filter: LiveActivityFilter) => {
    // no-op — see continuous sync effect above
  }, []);

  // ── ONE-TIME RESET — fires only on first session mount, not on every React
  // remount, so back-navigation and deep-link state are preserved across renders.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    logic.setNavigationVariants({ recommended: null, scenic: null, facilityRich: null });
    logic.setNavState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cross-screen handoff — entry-points outside /map (e.g. WorkoutPreviewDrawer)
  // can request the partner overlay opens directly by setting an intent on
  // useMapStore right before navigating here. Consumed exactly once on mount.
  // We jump straight past the radar/bubbles transient — the user already
  // expressed clear intent on the previous screen.
  useEffect(() => {
    const intent = useMapStore.getState().consumePendingPartnerOverlay();
    if (!intent) return;
    setMapMode('partners');
    setPartnerTab(intent.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BODY OVERFLOW LOCK — prevent scroll-through when searching ──
  useEffect(() => {
    if (logic.navState === 'searching') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [logic.navState]);

  // ── Bridge into commute mode ──────────────────────────────────────────
  // Funnel any "go to this destination" intent through a single helper so
  // the three entry points stay consistent:
  //   1. Generic Mapbox address picked from search.
  //   2. Saved Home/Work shortcut tapped (synthesised as a 'mapbox' source).
  //   3. (Phase 2) Park/Route entity card "Navigate" buttons.
  //
  // Always: clear the route selection slot, idle the search overlay,
  // capture the destination, flip mapMode='commute' so RouteCarousel
  // mounts. The carousel itself drives the rest.
  const startCommute = useCallback(
    (target: { coords: [number, number]; label?: string }) => {
      const [lng, lat] = target.coords;
      logic.setSelectedRoute(null);
      logic.setFocusedRoute(null);
      setCommuteRouteConfig({ destination: { lat, lng }, label: target.label });
      setMapMode('commute');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleAddressSelect = async (addr: any) => {
    // Run the legacy hook first — it handles park / route / mapbox
    // suggestion sources (clears search, opens entity cards, etc.).
    await logic.handleAddressSelect(addr);

    // ── Recent-searches sync ──────────────────────────────────────
    // Persist EVERY successful pick (park / route / mapbox / saved
    // place) so the search overlay's "חיפושים אחרונים" list reflects
    // the user's real history. The store dedups + caps internally so
    // repeated taps on the same entry are safe. Saved-place picks
    // are intentionally skipped here — they already live in the
    // dedicated SavedPlacesQuickRow row above the search bar, and
    // double-listing them as both shortcut + recent muddies the UX.
    if (addr?._source !== 'savedPlace' && Array.isArray(addr?.coords) && addr?.text) {
      const sourceForRecent: 'park' | 'route' | 'mapbox' =
        addr._source === 'park' || addr._source === 'route' ? addr._source : 'mapbox';
      useRecentSearchesStore.getState().pushRecent({
        text: addr.text,
        coords: addr.coords as [number, number],
        source: sourceForRecent,
      });
    }

    // Generic-address & savedPlace suggestions are the commute trigger.
    // Park / route hits open their entity card via logic.handleAddressSelect
    // and we MUST NOT re-fire commute on top of that. `recent` is also
    // a commute trigger (replayed generic addresses).
    const isCommuteTrigger =
      addr?._source === 'mapbox' ||
      addr?._source === 'savedPlace' ||
      !addr?._source;
    if (isCommuteTrigger && Array.isArray(addr?.coords)) {
      startCommute({ coords: addr.coords as [number, number], label: addr.text });
    }
  };

  // NavigationHub props — only the search-overlay slice is needed now.
  // The legacy navigation-variant props (navigationVariants / selectedVariant
  // / etc.) were dropped from the required prop set when NavigationHub's
  // 'navigating' branch was removed. They're left out here on purpose.
  const navHubProps = {
    navState: logic.navState,
    onStateChange: logic.setNavState,
    searchQuery: logic.searchQuery,
    onSearchChange: logic.setSearchQuery,
    suggestions: logic.suggestions,
    onAddressSelect: handleAddressSelect,
    isSearching: logic.isSearching,
    inputRef: logic.searchInputRef,
    onSetSavedPlace: (kind: SavedPlaceKind) => setSetPlaceSheetKind(kind),
  } as const;

  // ── Community enrichment — reactive via onSnapshot ──
  const rawDisplayRoutes = logic.routesToDisplay || [];
  const routeIds = useMemo(() => rawDisplayRoutes.map((r) => r.id), [rawDisplayRoutes]);
  const { enrichRoutes } = useCommunityEnrichment(routeIds, rawDisplayRoutes);
  const allDisplayRoutes = useMemo(() => enrichRoutes(rawDisplayRoutes), [enrichRoutes, rawDisplayRoutes]);
  const hasNearbyRoutes = allDisplayRoutes.length > 0;

  // ── Initial discover fit + auto-focus ──
  // The first time the user lands in discover mode with routes loaded we
  // want the camera to fit ALL routes (not just the first one). The actual
  // fit-all is owned by `useCameraController` (it sees `mapMode === 'discover'`
  // and runs once); this layer is only responsible for picking the focused
  // route AFTER the initial fit completes so the carousel has an active card.
  //
  // The ref guards against re-firing the auto-focus on remounts/route refreshes
  // within the same discover session, and is reset on leaving discover so
  // re-entry behaves like a fresh session.
  const initialDiscoverFitRef = useRef(false);

  useEffect(() => {
    if (mapMode !== 'discover') {
      initialDiscoverFitRef.current = false;
    }
  }, [mapMode]);

  useEffect(() => {
    if (
      mapMode === 'discover' &&
      allDisplayRoutes.length > 0 &&
      !logic.focusedRoute &&
      !initialDiscoverFitRef.current
    ) {
      initialDiscoverFitRef.current = true;
      // The camera controller pre-marks this id as already-fitted (via its
      // hasDoneInitialDiscoverFit pass) so this setFocusedRoute call does NOT
      // trigger a second fitBounds on top of the fit-all.
      logic.setFocusedRoute(allDisplayRoutes[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode, allDisplayRoutes.length]);

  // ── Handle mode changes ──
  const handleMapModeChange = (mode: MapMode) => {
    setMapMode(mode);
    if (mode !== 'discover') {
      logic.setFocusedRoute(null);
      logic.setSelectedRoute(null);
    }
    // Skip PartnerBubbles entirely — go straight to radar on every entry.
    if (mode === 'partners') {
      setPendingTab('live');
      setShowRadar(true);
    }
  };

  // ── THE LAW: SINGLE SCREEN STATE ──
  type Screen = 'SEARCH' | 'NAV' | 'ROUTE_CARD' | 'COMMUTE' | 'DISCOVERY';
  const screen: Screen = (() => {
    if (logic.navState === 'searching') return 'SEARCH';
    // 'navigating' is now a no-op (NavigationHub returns null on this
    // state). Kept in the union for backwards compat — falls through.
    if (logic.navState === 'navigating') return 'NAV';
    if (logic.selectedRoute) {
      // A route card tap can arrive while a drawer mode (FreeRun /
      // Partners / Commute) is open. Clear the local drawer mode so its
      // overlay doesn't linger behind the sheet.
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'ROUTE_CARD';
    }
    if (mapMode === 'commute' && commuteRouteConfig) return 'COMMUTE';
    return 'DISCOVERY';
  })();

  // ── Shared top bar: glassmorphic search + saved-places quick row + mode pills ──
  function renderTopBar() {
    // Saved-place tap → start commute. Stamp `_source: 'savedPlace'` for
    // analytics; the existing handleAddressSelect treats anything that
    // isn't 'park' / 'route' as a commute trigger.
    const handleSavedPlacePick = (place: SavedPlace) => {
      startCommute({ coords: place.coords, label: place.address ?? place.label });
    };

    return (
      <div className="absolute top-0 left-0 right-0 z-[70] pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pointer-events-none">
        <div className="max-w-md mx-auto w-full space-y-2">
          {/* Premium glass search bar — focus opens NavigationHub overlay */}
          <FloatingSearchBar
            inputRef={logic.searchInputRef}
            searchQuery={logic.searchQuery}
            onSearchChange={logic.setSearchQuery}
            onFocus={() => logic.setNavState('searching')}
          />

          {/* Saved Home / Work shortcuts.
              Visibility rule (refinement pass — was permanently
              visible everywhere except commute mode, which the
              field-test flagged as map clutter):
                • Show ONLY when the user is genuinely at the start
                  of a navigation / discovery flow, i.e.
                  `mapMode === 'idle'` (initial map view) OR
                  `mapMode === 'discover'` (browsing nearby routes).
                • Always hidden during freeRun / commute / partners
                  modes — the user has already committed to a flow
                  and the shortcuts would just compete with the
                  active surface. */}
          {(mapMode === 'idle' || mapMode === 'discover') && (
            <div className="pointer-events-auto">
              <SavedPlacesQuickRow
                onPick={handleSavedPlacePick}
                onSetRequest={(kind) => setSetPlaceSheetKind(kind)}
              />
            </div>
          )}

          {/* Mode header pills — also hidden in commute mode so the
              top surface stays focused on the active navigation flow. */}
          {mapMode !== 'commute' && (
            <div className="pointer-events-auto">
              <MapModeHeader
                activeMode={mapMode}
                onModeChange={handleMapModeChange}
                hasNearbyRoutes={hasNearbyRoutes}
                partnerCount={live.length}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SWITCH STATEMENT — only ONE branch renders, everything else is unmounted ──
  function renderScreen(): React.ReactNode {
    switch (screen) {
      case 'SEARCH':
        return <NavigationHub {...navHubProps} />;

      case 'NAV':
        return <NavigationHub {...navHubProps} />;

      case 'ROUTE_CARD': {
        const enrichedSelected = enrichRoutes([logic.selectedRoute!])[0];
        return (
          <>
            {renderTopBar()}

            <RouteDetailSheet
              isOpen
              route={enrichedSelected}
              userLocation={devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos ?? null}
              onClose={() => { logic.setSelectedRoute(null); logic.setFocusedRoute(null); }}
              onStartWorkout={(r) => {
                logic.setFocusedRoute(r);
                logic.startActiveWorkout();
              }}
              onNavigate={(r) => {
                // "Navigate to" on an entity card funnels into the
                // commute flow instead of re-opening the legacy
                // 3-variant drawer. We use the route's first path coord
                // as the destination — that's where the user wants to
                // arrive (the trailhead). The route card itself is
                // dismissed so the commute carousel can take the bottom.
                const startPoint = Array.isArray(r.path) && r.path.length > 0
                  ? r.path[0]
                  : null;
                if (!startPoint) return;
                logic.setSelectedRoute(null);
                logic.setFocusedRoute(null);
                startCommute({
                  coords: [startPoint[0], startPoint[1]],
                  label: r.name,
                });
              }}
              devSim={devSim}
            />
          </>
        );
      }

      case 'COMMUTE': {
        // The unified RouteCarousel mounted in commute mode. Top bar
        // stays visible (just the floating search) so the user can
        // change their destination at any time.
        if (!userLocation || !commuteRouteConfig) return null;
        return (
          <>
            {renderTopBar()}

            <RouteCarousel
              userPosition={userLocation}
              // ── Commute activity is per-session, NOT inherited ──
              // We deliberately ignore `logic.preferences.activity`
              // here — see the `commuteActivity` jsdoc above for why.
              // The user picks via the inline picker chip group; the
              // value re-triggers route generation through the
              // RouteCarousel reset effect.
              activity={commuteActivity}
              onActivityChange={setCommuteActivity}
              mode="commute"
              destination={commuteRouteConfig.destination}
              destinationLabel={commuteRouteConfig.label}
              focusedRouteId={logic.focusedRoute?.id ?? null}
              onFocusChange={(route) => logic.setFocusedRoute(route)}
              onBack={() => {
                // Drop the commute flow and clear the destination pin.
                // The map returns to its default discover surface.
                // setCommuteDestination(null) is called explicitly here
                // because the mirror effect is set-only — see its
                // jsdoc above for why.
                logic.setFocusedRoute(null);
                setCommuteRouteConfig(null);
                useMapStore.getState().setCommuteDestination(null);
                setMapMode('idle');
              }}
              onSelect={(route) => {
                // Stage the commute intent on useRunningPlayer BEFORE
                // startActiveWorkout fires. The pre-flight chain
                // (clearRunningData → initializeRunningData) does not
                // touch sessionMode / commuteContext, so the staged
                // values survive into the active session and the HUD
                // boots in commute flavour on first paint (no flash
                // from the workout HUD to the commute HUD). See
                // useRunningPlayer.SessionMode jsdoc for the contract.
                useRunningPlayer.getState().setCommuteContext({
                  destination: commuteRouteConfig.destination,
                  label: commuteRouteConfig.label,
                });
                // Mirror the commute-picker activity into the user
                // preferences right before starting so downstream
                // running-player logic (UI accents, calorie formula)
                // operates with the activity the user actually chose
                // for this commute, not the stale "last free-run"
                // activity. This is a write-only mirror; it stays
                // local to this session start and isn't persisted.
                logic.handleActivityChange(commuteActivity);
                logic.setFocusedRoute(route);
                setMapMode('idle');
                setCommuteRouteConfig(null);
                logic.startActiveWorkout();
              }}
            />
          </>
        );
      }

      case 'DISCOVERY':
        return (
          <>
            {/* Top bar (search + mode pills) is unmounted while the partner
                overlay is open — same pattern as SEARCH / NAV cases above,
                which simply don't render `renderTopBar()`. Keeps the map
                surface clean so the partner overlay owns the top of the
                screen. */}
            {partnerTab === null && renderTopBar()}

            {/* Layers button — top-right, below header (search bar 48px + gap 8px + mode pills 48px + 12px margin = 116px).
                Hidden while the partner overlay is open so the layers icon
                doesn't visually attach itself to the partners pill area —
                the overlay owns the top-right slot in that mode. */}
            {partnerTab === null && (
              <div className="absolute right-4 z-[50] pointer-events-none" style={{ top: 'calc(max(1.5rem, env(safe-area-inset-top)) + 116px)' }}>
                <MapLayersControl liveCount={live.length} />
              </div>
            )}

            {/* HUD — z-[40]. Bottom offset accounts for carousel height + safe-area. */}
            <div className="absolute right-4 z-[40] flex flex-col gap-3" style={{ bottom: 'calc(max(340px, env(safe-area-inset-bottom, 0px) + 310px))' }}>
              <ActionSpeedDial
                onAdd={() => setWizardOpen(true)}
                onReport={() => setReportOpen(true)}
              />
              <button
                onClick={logic.handleLocationClick}
                className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all"
              >
                <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : 'none'} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
              </button>
            </div>

            {/* ── Bottom content: single premium carousel for ALL route types ── */}
            {mapMode === 'discover' && allDisplayRoutes.length > 0 && (
              <BottomJourneyContainer
                routes={allDisplayRoutes}
                onRouteFocus={(r) => {
                  logic.setFocusedRoute(r);
                }}
                focusedRouteId={logic.focusedRoute?.id || null}
                loadingRouteIds={logic.loadingRouteIds}
                onShowDetails={() => logic.setShowDetailsDrawer(true)}
                onStartWorkout={logic.startActiveWorkout}
                onShowRouteDetail={(r) => {
                  logic.setSelectedRoute(r);
                  logic.setFocusedRoute(r);
                }}
              />
            )}

            {/* ── Free-run flow — three stages, mutually exclusive ───────
                Stage 1: ActivityCarousel (floating cards over the map).
                Stage 2: FreeRunDrawer  (mode + goal + start CTA).
                Stage 3: RouteCarousel  (floating route options over the map).
                All guarded by `mapMode === 'freeRun'`; only one renders at
                a time per the one-card-only UI rule. */}
            {mapMode === 'freeRun' && freeRunStep === 'activity' && (
              <ActivityCarousel
                currentActivity={logic.preferences.activity}
                onSelect={(activity) => {
                  logic.handleActivityChange(activity);
                  setFreeRunStep('config');
                }}
                onClose={() => setMapMode('idle')}
              />
            )}

            {mapMode === 'freeRun' && freeRunStep === 'config' && (
              <FreeRunDrawer
                currentActivity={logic.preferences.activity}
                onBackToActivity={() => setFreeRunStep('activity')}
                onStartWorkout={logic.startActiveWorkout}
                onClose={() => setMapMode('idle')}
                userPosition={userLocation}
                cityName={userCityName}
                onRequestRouteGeneration={({ targetKm, includeStrength, surface }) => {
                  // The user picked "with route" + tapped Generate in the
                  // drawer. Capture the full config payload, drop the drawer,
                  // and let the floating RouteCarousel run the radar +
                  // generator + 3-card UI on the visible map.
                  setRouteCarouselConfig({ targetKm, includeStrength, surface });
                  setFreeRunStep('route');
                }}
              />
            )}

            {mapMode === 'freeRun' &&
              freeRunStep === 'route' &&
              userLocation &&
              routeCarouselConfig && (
                <RouteCarousel
                  userPosition={userLocation}
                  activity={logic.preferences.activity}
                  targetKm={routeCarouselConfig.targetKm}
                  includeStrength={routeCarouselConfig.includeStrength}
                  surface={routeCarouselConfig.surface}
                  cityName={userCityName}
                  // Bidirectional sync: when the user taps a route line on
                  // the map, the parent's focusedRoute updates and the
                  // carousel scrolls to the matching card. The carousel
                  // filters self-emitted ids via its own ref so this
                  // doesn't create an echo loop with onFocusChange below.
                  focusedRouteId={logic.focusedRoute?.id ?? null}
                  onFocusChange={(route) => {
                    // Sync the centered card to `focusedRoute` so the
                    // camera fitBounds-debounce in useCameraController
                    // reframes the map. Debounced inside the carousel so
                    // a fast multi-card flick fires this exactly once at
                    // the destination — not N times during the swipe.
                    logic.setFocusedRoute(route);
                  }}
                  onBack={() => {
                    // Drop the carousel and return to the config drawer.
                    // Clearing `focusedRoute` keeps the map in its
                    // pre-route state so the user doesn't see a stray
                    // highlight on the empty map.
                    logic.setFocusedRoute(null);
                    setFreeRunStep('config');
                  }}
                  onSelect={(route) => {
                    // Pin the chosen route as the focus so the active-workout
                    // overlay opens with it pre-selected, then exit free-run
                    // mode and kick off the same start path as discover.
                    logic.setFocusedRoute(route);
                    setMapMode('idle');
                    logic.startActiveWorkout();
                  }}
                />
              )}

            {/* ── Partner Finder flow ─────────────────────────────────
                State machine: radar (transient) → overlay.
                PartnerBubbles is kept but no longer rendered — the mode
                button tap goes straight to radar with default tab='live'.
                AnimatePresence honours per-component exit animations. */}
            <AnimatePresence>
              {mapMode === 'partners' && showRadar && pendingTab && (
                <RadarAnimation
                  key="partner-radar"
                  tab={pendingTab}
                  isCached={!isLoading}
                  onComplete={handleRadarComplete}
                  // Partner search uses the slower 3 s tempo — feels
                  // like a more thorough scan for the right people.
                  mode="partners"
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {mapMode === 'partners' && partnerTab !== null && (
                <PartnerOverlay
                  key="partner-overlay"
                  initialTab={partnerTab}
                  userLocation={userLocation}
                  live={live}
                  scheduled={scheduled}
                  isLoading={isLoading}
                  onClose={handlePartnerOverlayClose}
                  onFiltersChange={handlePartnerFiltersChange}
                />
              )}
            </AnimatePresence>

            <ParkPreview userLocation={logic.currentUserPos ?? null} />
          </>
        );
    }
  }

  return (
    <>
      {renderScreen()}

      {/* ═══ Global overlays — always available, never conflict ═══ */}
      {logic.isGenerating && <RouteGenerationLoader />}

      {process.env.NODE_ENV !== 'production' && devSim && <MockLocationPanel devSim={devSim} />}

      <ContributionWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialLocation={logic.currentUserPos}
      />
      <QuickReportSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        userLocation={logic.currentUserPos ?? null}
      />

      {/* Saved-places editor — opened from the Quick Row tap-to-set
          flow OR from the NavigationHub overlay's smart Home/Work
          tile when the slot is empty. Self-closes on save / cancel. */}
      <SetSavedPlaceSheet
        openKind={setPlaceSheetKind}
        onClose={() => setSetPlaceSheetKind(null)}
      />
    </>
  );
}
