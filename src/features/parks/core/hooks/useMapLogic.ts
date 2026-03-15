'use client';

/**
 * useMapLogic — composition root.
 *
 * Delegates to four focused hooks:
 *   useGPS             — location tracking, bearing, fallback
 *   useRouteGeneration — Mapbox route generation, filters, parks cache
 *   useSearchNavigation — geocoding, address search, AI coach
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
import { useSearchNavigation } from './useSearchNavigation';
import { useWorkoutSession } from './useWorkoutSession';

export const useMapLogic = (mapMode?: string, contextActivity?: ActivityType) => {
  const { profile } = useUserStore();

  const [workoutMode, setWorkoutMode] = useState<'free' | 'discover'>('discover');

  // Hoist navState so both search and route hooks can use it
  const [navState, setNavState] = useState<NavHubState>('idle');

  // 1. GPS
  const gps = useGPS();

  // 2. Route Generation (uses navState + mapMode gate)
  const routes = useRouteGeneration(gps.currentUserPos, workoutMode, navState, mapMode, contextActivity);

  // 3. Search & Navigation (receives route setters so address selection works)
  const search = useSearchNavigation(
    gps.currentUserPos,
    routes.selectedNavActivity,
    routes.setNavigationRoutes,
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

  // Wire address select to also update navState (owned here)
  const handleAddressSelect = async (addr: { text: string; coords: [number, number] }) => {
    setNavState('navigating');
    search.setSearchQuery('');
    search.setSuggestions([]);
    await search.fetchAllNavigationRoutes(addr);
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

    // Search & Navigation
    searchQuery: search.searchQuery,
    setSearchQuery: search.setSearchQuery,
    suggestions: search.suggestions,
    setSuggestions: search.setSuggestions,
    isSearching: search.isSearching,
    navState,
    setNavState,
    selectedAddress: search.selectedAddress,
    isChatOpen: search.isChatOpen,
    setIsChatOpen: search.setIsChatOpen,
    chatMessages: search.chatMessages,
    isAILoading: search.isAILoading,
    isFilterOpen: search.isFilterOpen,
    setIsFilterOpen: search.setIsFilterOpen,
    searchInputRef: search.searchInputRef,
    handleAddressSelect,
    fetchAllNavigationRoutes: search.fetchAllNavigationRoutes,
    handleAICoachRequest: search.handleAICoachRequest,

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
    jitState: session.jitState,
    dismissJIT: session.dismissJIT,
    cancelJIT: session.cancelJIT,

    // Mode toggle
    workoutMode,
    setWorkoutMode,
  };
};
