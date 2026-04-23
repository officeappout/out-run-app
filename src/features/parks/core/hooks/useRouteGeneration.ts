'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { MOCK_ROUTES } from '../data/mock-routes';
import { fetchRealParks } from '../services/parks.service';
import { InventoryService, getCachedOfficialRoutes } from '../services/inventory.service';
import { Route, ActivityType } from '../types/route.types';
import { Park } from '../types/park.types';
import { useRouteFilter, FilterPreferences } from './useRouteFilter';
import { NavHubState } from '../components/NavigationHub';
import { isRouteNearby, distanceToRouteStart } from '../services/geoUtils';

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
  setEffectiveUserPos: (pos: { lat: number; lng: number } | null) => void;
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
  const [effectiveUserPos, setEffectiveUserPos] = useState<{ lat: number; lng: number } | null>(null);

  const { filteredRoutes, preferences, updateFilter, isGenerating } =
    useRouteFilter(allRoutes, currentUserPos, routeGenerationIndex, mapMode);

  // ── Fetch official routes from Firestore on mount ──
  const [officialRoutes, setOfficialRoutes] = useState<Route[]>([]);
  const officialFetched = useRef(false);

  useEffect(() => {
    if (officialFetched.current) return;
    officialFetched.current = true;
    InventoryService.fetchOfficialRoutes()
      .then((routes) => {
        console.log(`[Routes] Fetched ${routes.length} official routes from Firestore`);
        if (routes.length > 0) {
          setOfficialRoutes(routes);
        }
      })
      .catch((err) => console.error('[Routes] Failed to fetch official routes:', err));
  }, []);

  const proximityPos = effectiveUserPos ?? currentUserPos;

  const routesToDisplay = useMemo(() => {
    if (navState === 'navigating' && navigationRoutes[selectedNavActivity]) {
      return [navigationRoutes[selectedNavActivity]!];
    }
    const dynamicRoutes = filteredRoutes;
    const dynamicIds = new Set(dynamicRoutes.map(r => r.id));
    const nearbyOfficial = officialRoutes.filter(r => {
      if (dynamicIds.has(r.id)) return false;
      if (!proximityPos) return false;
      return isRouteNearby(r, proximityPos);
    });

    const merged = [...dynamicRoutes, ...nearbyOfficial];

    const MAX_DISPLAY = 3;

    if (!proximityPos) return merged.slice(0, MAX_DISPLAY);
    return merged
      .sort((a, b) => distanceToRouteStart(a, proximityPos) - distanceToRouteStart(b, proximityPos))
      .slice(0, MAX_DISPLAY);
  }, [navState, navigationRoutes, selectedNavActivity, filteredRoutes, officialRoutes, proximityPos]);

  const handleShuffle = useCallback(async (activity?: ActivityType) => {
    if (!currentUserPos) return;
    setIsGeneratingRoutes(true);
    const newIndex = routeGenerationIndex + 1;
    setRouteGenerationIndex(newIndex);
    const act = activity || preferences.activity || 'running';
    const speed = act === 'cycling' ? 20 : act === 'running' ? 10 : 5;
    const targetKm = (preferences.duration || 30) * (speed / 60);

    try {
      setAllRoutes([]);
      setFocusedRoute(null);
      setSelectedRoute(null);

      // Official-route priority: check cached official routes before generating
      const official = await getCachedOfficialRoutes();
      const matched = official
        .filter(r => {
          const actOk = !r.activityType || r.activityType === act;
          const distOk = Math.abs((r.distance || 0) - targetKm) <= targetKm * 0.6;
          return actOk && distOk;
        })
        .sort((a, b) =>
          Math.abs((a.distance || 0) - targetKm) - Math.abs((b.distance || 0) - targetKm),
        )
        .slice(0, 3);

      if (matched.length >= 1) {
        console.log(`[Builder] Using ${matched.length} official routes (target ${targetKm.toFixed(1)}km)`);
        setAllRoutes(matched);
        setFocusedRoute(matched[0]);
        return;
      }

      // Fallback: dynamic loop generator
      const parks = await getCachedParks();
      const newRoutes = await generateDynamicRoutes({
        userLocation: currentUserPos,
        targetDistance: targetKm,
        activity: act,
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
    setEffectiveUserPos,
  };
}
