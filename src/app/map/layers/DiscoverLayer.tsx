'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import FreeRunDrawer from '@/features/parks/core/components/FreeRunDrawer';
import PartnersDrawer from '@/features/parks/core/components/PartnersDrawer';
import MapModeHeader, { MapMode } from '@/features/parks/core/components/MapModeHeader';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { useMapLogic } from '@/features/parks';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { ParkPreview } from '@/features/parks/client/components/park-preview';
import RouteDetailSheet from '@/features/parks/client/components/route-preview/RouteDetailSheet';
import { MapLayersControl } from '@/features/parks/core/components/MapLayersControl';
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';
import { useCommunityEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import {
  Search, Navigation, X,
  Plus, Zap, Crosshair,
} from 'lucide-react';
import { motion } from 'framer-motion';

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

  // ── FORCED RESET ON MOUNT — clean map every refresh ──
  useEffect(() => {
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    logic.setNavigationVariants({ recommended: null, scenic: null, facilityRich: null });
    logic.setNavState('idle');
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

  // ── Auto-focus the closest route when entering discover mode ──
  useEffect(() => {
    if (mapMode === 'discover' && allDisplayRoutes.length > 0 && !logic.focusedRoute) {
      logic.setFocusedRoute(allDisplayRoutes[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode, allDisplayRoutes.length]);

  // ── Handle mode changes ──
  const handleMapModeChange = (mode: MapMode) => {
    setMapMode(mode);
    if (mode !== 'discover') {
      // Clear focused route when leaving discover — cleans map back to idle state
      logic.setFocusedRoute(null);
      logic.setSelectedRoute(null);
    }
  };

  // ── THE LAW: SINGLE SCREEN STATE ──
  type Screen = 'SEARCH' | 'NAV' | 'ROUTE_CARD' | 'DISCOVERY';
  const screen: Screen = (() => {
    if (logic.navState === 'searching') return 'SEARCH';
    if (logic.navState === 'navigating') return 'NAV';
    if (logic.selectedRoute) return 'ROUTE_CARD';
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
            {renderTopBar()}

            {/* Layers button — top-right, below header */}
            <div className="absolute right-4 z-[50] pointer-events-none" style={{ top: 'calc(max(1.5rem, env(safe-area-inset-top)) + 100px)' }}>
              <MapLayersControl />
            </div>

            {/* HUD — z-[40] */}
            <div className="absolute right-4 z-[40] bottom-[350px] flex flex-col gap-3">
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
              {devSim && (
                <button
                  onClick={devSim.toggleMock}
                  className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center pointer-events-auto active:scale-95 transition-all ${devSim.isMockEnabled ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-gray-100 text-gray-500'}`}
                  title="Mock Location"
                >
                  <Crosshair size={18} />
                </button>
              )}
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
              />
            )}

            {mapMode === 'partners' && (
              <PartnersDrawer
                onClose={() => setMapMode('idle')}
                userLocation={logic.currentUserPos ?? null}
              />
            )}

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

      {devSim?.isMockEnabled && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-[max(3.5rem,calc(env(safe-area-inset-top)+3rem))] left-1/2 -translate-x-1/2 z-[120] pointer-events-auto"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-full shadow-lg text-[11px] font-bold" dir="rtl">
            <Crosshair size={12} className="animate-pulse" />
            <span>מיקום מדומה פעיל</span>
            {devSim.isSimulating && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                {Math.round(devSim.simulationProgress * 100)}%
              </span>
            )}
            <button onClick={devSim.toggleMock} className="mr-1 hover:bg-white/20 rounded-full p-0.5 transition-colors">
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}

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
