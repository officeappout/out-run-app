'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { MOCK_ROUTES } from '../data/mock-routes';
import { fetchRealParks } from '../services/parks.service';
import { Route, ActivityType } from '../types/route.types';
import { Park } from '../types/park.types';
import { useRouteFilter, FilterPreferences } from './useRouteFilter';
import { NavHubState } from '../components/NavigationHub';

let _parksCache: Park[] | null = null;
async function getCachedParks(): Promise<Park[]> {
  if (!_parksCache) _parksCache = await fetchRealParks();
  return _parksCache;
}

export interface RouteGenerationState {
  allRoutes: Route[];
  setAllRoutes: (r: Route[]) => void;
  routeGenerationIndex: number;
  setRouteGenerationIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedRoute: Route | null;
  setSelectedRoute: (r: Route | null) => void;
  focusedRoute: Route | null;
  setFocusedRoute: (r: Route | null) => void;
  loadingRouteIds: Set<string>;
  smartPaths: Record<string, any>;
  setSmartPaths: (p: Record<string, any>) => void;
  isGenerating: boolean;
  routesToDisplay: Route[];
  preferences: FilterPreferences;
  updateFilter: (p: Partial<FilterPreferences>) => void;
  handleShuffle: (activity?: ActivityType) => Promise<void>;
  handleActivityChange: (t: ActivityType) => void;
  navigationRoutes: Record<ActivityType, Route | null>;
  setNavigationRoutes: (r: Record<ActivityType, Route | null>) => void;
  selectedNavActivity: ActivityType;
  setSelectedNavActivity: (t: ActivityType) => void;
}

export function useRouteGeneration(
  currentUserPos: { lat: number; lng: number } | null,
  workoutMode: 'free' | 'discover',
  navState: NavHubState,
  mapMode?: string,
  contextActivity?: ActivityType,
): RouteGenerationState {
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [routeGenerationIndex, setRouteGenerationIndex] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<Route | null>(null);
  const [loadingRouteIds] = useState<Set<string>>(new Set());
  const [smartPaths, setSmartPaths] = useState<Record<string, any>>({});
  const [isGeneratingRoutes, setIsGeneratingRoutes] = useState(false);
  const [navigationRoutes, setNavigationRoutes] = useState<Record<ActivityType, Route | null>>({
    walking: null, running: null, cycling: null, workout: null,
  });
  const [selectedNavActivity, setSelectedNavActivity] = useState<ActivityType>(
    contextActivity ?? 'walking',
  );

  const { filteredRoutes, preferences, updateFilter, isGenerating } =
    useRouteFilter(allRoutes, currentUserPos, routeGenerationIndex, mapMode);

  // NO auto-generation on mount. Routes are ONLY generated via handleShuffle
  // (explicit user interaction through BuilderLayer / DiscoverLayer).

  const routesToDisplay = useMemo(() => {
    if (navState === 'navigating' && navigationRoutes[selectedNavActivity]) {
      return [navigationRoutes[selectedNavActivity]!];
    }
    return filteredRoutes;
  }, [navState, navigationRoutes, selectedNavActivity, filteredRoutes]);

  // Auto-focus first route when routes arrive
  useEffect(() => {
    if (!routesToDisplay || routesToDisplay.length === 0 || focusedRoute) return;
    const first = routesToDisplay[0];
    if (!first?.path || first.path.length < 2) return;
    setFocusedRoute(first);
    setSelectedRoute(first);
  }, [routesToDisplay, focusedRoute]);

  const handleShuffle = useCallback(async (activity?: ActivityType) => {
    if (!currentUserPos) return;
    setIsGeneratingRoutes(true);
    const newIndex = routeGenerationIndex + 1;
    setRouteGenerationIndex(newIndex);
    try {
      setAllRoutes([]);
      setFocusedRoute(null);
      setSelectedRoute(null);
      const parks = await getCachedParks();
      const targetDistance = (preferences.duration || 30) * ((preferences.activity === 'cycling' ? 20 : 6) / 60);
      const newRoutes = await generateDynamicRoutes({
        userLocation: currentUserPos,
        targetDistance,
        activity: activity || preferences.activity || 'running',
        routeGenerationIndex: newIndex,
        preferences: { includeStrength: preferences.includeStrength || false, surface: preferences.surface as 'road' | 'trail' },
        parks,
      });
      if (newRoutes.length > 0) { setAllRoutes(newRoutes); setFocusedRoute(newRoutes[0]); }
      else { setAllRoutes(MOCK_ROUTES); if (MOCK_ROUTES.length > 0) setFocusedRoute(MOCK_ROUTES[0]); }
    } catch { setAllRoutes(MOCK_ROUTES); } finally { setIsGeneratingRoutes(false); }
  }, [currentUserPos, routeGenerationIndex, preferences]);

  const handleActivityChange = useCallback((t: ActivityType) => updateFilter({ activity: t }), [updateFilter]);

  return {
    allRoutes, setAllRoutes,
    routeGenerationIndex, setRouteGenerationIndex,
    selectedRoute, setSelectedRoute,
    focusedRoute, setFocusedRoute,
    loadingRouteIds, smartPaths, setSmartPaths,
    isGenerating: isGenerating || isGeneratingRoutes,
    routesToDisplay, preferences, updateFilter,
    handleShuffle, handleActivityChange,
    navigationRoutes, setNavigationRoutes: setNavigationRoutes as any,
    selectedNavActivity, setSelectedNavActivity,
  };
}
