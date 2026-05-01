'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import FreeRunDrawer from '@/features/parks/core/components/FreeRunDrawer';
import MapModeHeader, { MapMode } from '@/features/parks/core/components/MapModeHeader';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { useMapLogic } from '@/features/parks';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { ParkPreview } from '@/features/parks/client/components/park-preview';
import RouteDetailSheet from '@/features/parks/client/components/route-preview/RouteDetailSheet';
import { MapLayersControl } from '@/features/parks/core/components/MapLayersControl';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
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
  Search, Navigation, X,
  Plus, Zap,
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

  const handleAddressSelect = async (addr: any) => {
    await logic.handleAddressSelect(addr);
  };

  // NavigationHub props (shared between SEARCH and NAV screens)
  const navHubProps = {
    navState: logic.navState,
    onStateChange: logic.setNavState,
    navigationVariants: logic.navigationVariants,
    selectedVariant: logic.selectedVariant,
    onVariantSelect: (v: any) => logic.handleVariantSelect(v),
    navActivity: logic.navActivity,
    onActivityChange: async (act: any) => {
      logic.setNavActivity(act);
      if (logic.selectedAddress) {
        await logic.fetchNavigationVariants(logic.selectedAddress, act);
      }
    },
    isLoading: logic.isGenerating,
    onStart: logic.startActiveWorkout,
    searchQuery: logic.searchQuery,
    onSearchChange: logic.setSearchQuery,
    suggestions: logic.suggestions,
    onAddressSelect: handleAddressSelect,
    isSearching: logic.isSearching,
    inputRef: logic.searchInputRef,
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
  type Screen = 'SEARCH' | 'NAV' | 'ROUTE_CARD' | 'DISCOVERY';
  const screen: Screen = (() => {
    if (logic.navState === 'searching') return 'SEARCH';
    if (logic.navState === 'navigating') return 'NAV';
    if (logic.selectedRoute) {
      // A route card tap can arrive while a drawer mode (FreeRun / Partners) is open.
      // Clear the local drawer mode so its overlay doesn't linger behind the sheet.
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'ROUTE_CARD';
    }
    return 'DISCOVERY';
  })();

  // ── Shared top bar: Search + Mode Header ──
  function renderTopBar() {
    return (
      <div className="absolute top-0 left-0 right-0 z-[70] pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pointer-events-none">
        <div className="max-w-md mx-auto w-full space-y-2">
          {/* Search bar */}
          <div className="pointer-events-auto">
            <div className="bg-white rounded-2xl h-12 flex items-center px-2 border overflow-hidden shadow-lg border-gray-100">
              <div className="flex-1 flex items-center h-full">
                <Search className="text-gray-400 ms-2 shrink-0" size={20} />
                <input
                  ref={logic.searchInputRef}
                  type="text"
                  placeholder="חיפוש מסלול..."
                  value={logic.searchQuery}
                  onFocus={() => logic.setNavState('searching')}
                  onChange={(e) => logic.setSearchQuery(e.target.value)}
                  className="w-full h-full bg-transparent border-none outline-none text-sm text-gray-700 px-2 placeholder:text-gray-400 text-right font-bold"
                />
              </div>
            </div>
          </div>

          {/* Mode header pills */}
          <div className="pointer-events-auto">
            <MapModeHeader
              activeMode={mapMode}
              onModeChange={handleMapModeChange}
              hasNearbyRoutes={hasNearbyRoutes}
              partnerCount={live.length}
            />
          </div>
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
                logic.setFocusedRoute(r);
                logic.setNavState('navigating');
              }}
              devSim={devSim}
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

            {mapMode === 'freeRun' && (
              <FreeRunDrawer
                currentActivity={logic.preferences.activity}
                onActivityChange={logic.handleActivityChange}
                onStartWorkout={logic.startActiveWorkout}
                onClose={() => setMapMode('idle')}
                userPosition={userLocation}
                cityName={userCityName}
                onStartWorkoutWithRoute={(route) => {
                  // Pin the chosen route as the focus so the active-workout
                  // overlay opens with it pre-selected, then drop the drawer
                  // mode and kick off the same start path as discover-mode.
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
    </>
  );
}
