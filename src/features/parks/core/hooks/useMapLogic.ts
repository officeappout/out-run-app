'use client';

/**
 * useMapLogic — composition root.
 *
 * Delegates to four focused hooks:
 *   useGPS             — location tracking, bearing, fallback
 *   useRouteGeneration — Mapbox route generation, filters, parks cache
 *   useSearchNavigation — geocoding, address search, 3-variant nav
 *   useWorkoutSession  — timer, GPS watch, workout lifecycle
 *
 * Returns the same flat API surface so all existing callers keep working.
 */

import { useState } from 'react';
import { useUserStore } from '@/features/user';
import { NavHubState } from '../components/NavigationHub';
import { ActivityType } from '../types/route.types';
import { useGPS } from './useGPS';
import { useRouteGeneration } from './useRouteGeneration';
import { useSearchNavigation, type SearchSuggestion } from './useSearchNavigation';
import { useWorkoutSession } from './useWorkoutSession';
import { useMapStore } from '../store/useMapStore';
import { getCachedOfficialRoutes } from '../services/inventory.service';

export const useMapLogic = (mapMode?: string, contextActivity?: ActivityType) => {
  const { profile } = useUserStore();
  const { setSelectedPark } = useMapStore();

  const [workoutMode, setWorkoutMode] = useState<'free' | 'discover'>('discover');

  // Hoist navState so both search and route hooks can use it
  const [navState, setNavState] = useState<NavHubState>('idle');

  // 1. GPS
  const gps = useGPS();

  // 2. Route Generation (uses navState + mapMode gate)
  const routes = useRouteGeneration(gps.currentUserPos, workoutMode, navState, mapMode, contextActivity);

  // 3. Search & Navigation (new signature — no longer needs setNavigationRoutes)
  const search = useSearchNavigation(
    gps.currentUserPos,
    routes.setFocusedRoute,
    routes.setSelectedRoute,
  );

  // 4. Workout Session
  const session = useWorkoutSession(
    gps.currentUserPos,
    gps.setCurrentUserPos,
    routes.focusedRoute,
    workoutMode,
    profile,
  );

  // Wire address/park/route select — handles all three suggestion sources
  const handleAddressSelect = async (addr: SearchSuggestion) => {
    routes.setSelectedRoute(null);
    search.setSearchQuery('');
    search.setSuggestions([]);

    if (addr._source === 'park' && addr._id) {
      const { fetchRealParks } = await import('../services/parks.service');
      const parks = await fetchRealParks();
      const park = parks.find(p => p.id === addr._id);
      if (park) setSelectedPark(park);
      setNavState('idle');
      return;
    }

    if (addr._source === 'route' && addr._id) {
      const allRoutes = await getCachedOfficialRoutes();
      const route = allRoutes.find(r => r.id === addr._id);
      if (route) {
        routes.setSelectedRoute(route);
        routes.setFocusedRoute(route);
      }
      setNavState('idle');
      return;
    }

    setNavState('navigating');
    await search.fetchNavigationVariants(addr, search.navActivity);
  };

  // Wrap setNavState to clear navigation artifacts when returning to idle
  const handleNavStateChange = (state: NavHubState) => {
    if (state === 'idle') {
      search.setNavigationVariants({ recommended: null, scenic: null, facilityRich: null });
      routes.setSelectedRoute(null);
      routes.setFocusedRoute(null);
    }
    setNavState(state);
  };

  // When user selects a variant (via NavigationHub card or map route tap)
  const handleVariantSelect = (variantKey: string) => {
    const variants = search.navigationVariants;
    let matched: import('../types/route.types').Route | null = null;

    if (variantKey === 'recommended' || variantKey.includes('recommended')) {
      matched = variants.recommended;
      search.setSelectedVariant('recommended');
    } else if (variantKey === 'scenic' || variantKey.includes('scenic')) {
      matched = variants.scenic;
      search.setSelectedVariant('scenic');
    } else if (variantKey === 'facilityRich' || variantKey.includes('facility')) {
      matched = variants.facilityRich;
      search.setSelectedVariant('facilityRich');
    }

    if (matched) {
      routes.setFocusedRoute(matched);
      routes.setSelectedRoute(matched);
    }
  };

  return {
    // GPS
    currentUserPos: gps.currentUserPos,
    userBearing: gps.userBearing,
    isFollowing: gps.isFollowing,
    handleLocationClick: gps.handleLocationClick,

    // Route Generation
    routeGenerationIndex: routes.routeGenerationIndex,
    setRouteGenerationIndex: routes.setRouteGenerationIndex,
    allRoutes: routes.allRoutes,
    setAllRoutes: routes.setAllRoutes,
    smartPaths: routes.smartPaths,
    setSmartPaths: routes.setSmartPaths,
    loadingRouteIds: routes.loadingRouteIds,
    selectedRoute: routes.selectedRoute,
    setSelectedRoute: routes.setSelectedRoute,
    focusedRoute: routes.focusedRoute,
    setFocusedRoute: routes.setFocusedRoute,
    isGenerating: routes.isGenerating,
    routesToDisplay: routes.routesToDisplay,
    preferences: routes.preferences,
    updateFilter: routes.updateFilter,
    handleShuffle: routes.handleShuffle,
    handleActivityChange: routes.handleActivityChange,
    navigationRoutes: routes.navigationRoutes,
    selectedNavActivity: routes.selectedNavActivity,
    setSelectedNavActivity: routes.setSelectedNavActivity,
    setEffectiveUserPos: routes.setEffectiveUserPos,
    setSimulationActive: gps.setSimulationActive,

    // Search & Navigation — new 3-variant API
    searchQuery: search.searchQuery,
    setSearchQuery: search.setSearchQuery,
    suggestions: search.suggestions,
    setSuggestions: search.setSuggestions,
    isSearching: search.isSearching,
    navState,
    setNavState: handleNavStateChange,
    selectedAddress: search.selectedAddress,
    isFilterOpen: search.isFilterOpen,
    setIsFilterOpen: search.setIsFilterOpen,
    searchInputRef: search.searchInputRef,
    handleAddressSelect,
    fetchNavigationVariants: search.fetchNavigationVariants,

    // Navigation variants
    navigationVariants: search.navigationVariants,
    setNavigationVariants: search.setNavigationVariants,
    selectedVariant: search.selectedVariant,
    setSelectedVariant: search.setSelectedVariant,
    navActivity: search.navActivity,
    setNavActivity: search.setNavActivity,
    handleVariantSelect,

    // Workout Session
    isWorkoutActive: session.isWorkoutActive,
    setIsWorkoutActive: session.setIsWorkoutActive,
    isWorkoutPaused: session.isWorkoutPaused,
    setIsWorkoutPaused: session.setIsWorkoutPaused,
    isNavigationMode: session.isNavigationMode,
    setIsNavigationMode: session.setIsNavigationMode,
    workoutStartTime: session.workoutStartTime,
    setWorkoutStartTime: session.setWorkoutStartTime,
    livePath: session.livePath,
    setLivePath: session.setLivePath,
    showSummary: session.showSummary,
    setShowSummary: session.setShowSummary,
    showDopamine: session.showDopamine,
    setShowDopamine: session.setShowDopamine,
    showDetailsDrawer: session.showDetailsDrawer,
    setShowDetailsDrawer: session.setShowDetailsDrawer,
    elapsedTime: session.elapsedTime,
    runDistance: session.runDistance,
    runPace: session.runPace,
    userWeight: session.userWeight,
    status: session.status,
    startActiveWorkout: session.startActiveWorkout,
    pauseSession: session.pauseSession,
    resumeSession: session.resumeSession,
    endSession: session.endSession,
    triggerLap: session.triggerLap,
    addCoord: session.addCoord,
    injectSimPosition: session.injectSimPosition,
    jitState: session.jitState,
    dismissJIT: session.dismissJIT,
    cancelJIT: session.cancelJIT,

    // Mode toggle
    workoutMode,
    setWorkoutMode,
  };
};
