import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMapStore } from '@/features/map/store/useMapStore';
import { useRunStore } from '@/features/run/store/useRunStore';
import { useUserStore } from '@/features/user/store/useUserStore';
import { useRouteFilter } from '@/features/map/hooks/useRouteFilter';
import { MapboxService } from '@/features/map/services/mapbox.service';
import { generateDynamicRoutes } from '@/features/map/services/route-generator.service';
import { getAIRecommendation } from '@/features/map/services/ai-coach.service';
import { MOCK_ROUTES } from '@/features/map/data/mock-routes';
import { MOCK_PARKS } from '@/features/map/data/mock-locations';
import { Route, ActivityType } from '@/features/map/types/map-objects.type';
import { NavHubState } from '@/features/map/components/NavigationHub';
import { ChatMessage } from '@/features/map/components/ChatDrawer';

// Helper: Calculate distance in KM
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
}

// Helper: Format Pace
function formatPace(distanceKm: number, timeSeconds: number): string {
  if (distanceKm <= 0) return "0:00";
  const paceDec = (timeSeconds / 60) / distanceKm;
  const mins = Math.floor(paceDec);
  const secs = Math.round((paceDec - mins) * 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const useMapLogic = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Stores
  const { isFollowing, setUserLocation, triggerUserLocation } = useMapStore();
  const { status, startRun, pauseRun, resumeRun, stopRun, triggerLap, updateDuration, addCoord, updateRunData } = useRunStore();
  const { profile } = useUserStore();

  // Local State
  const [currentUserPos, setCurrentUserPos] = useState<{ lat: number, lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [routeGenerationIndex, setRouteGenerationIndex] = useState(0);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [smartPaths, setSmartPaths] = useState<Record<string, any>>({});
  const [loadingRouteIds, setLoadingRouteIds] = useState<Set<string>>(new Set());
  
  // Real Stats
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runDistance, setRunDistance] = useState(0); 

  // Navigation & UI
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<Route | null>(null);
  const [workoutMode, setWorkoutMode] = useState<'free' | 'discover'>('discover');
  const [navState, setNavState] = useState<NavHubState>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingRoutes, setIsGeneratingRoutes] = useState(false);
  const [navigationRoutes, setNavigationRoutes] = useState<Record<ActivityType, Route | null>>({ walking: null, running: null, cycling: null, workout: null });
  const [selectedNavActivity, setSelectedNavActivity] = useState<ActivityType>('walking');

  // Workout State
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [livePath, setLivePath] = useState<[number, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [userBearing, setUserBearing] = useState(0);
  const [workoutWatchId, setWorkoutWatchId] = useState<number | null>(null);

  const { filteredRoutes, preferences, updateFilter, isGenerating } = useRouteFilter(allRoutes, currentUserPos, routeGenerationIndex);

  // ✅ FIX: Safe access to weight (using 'any' to bypass strict TS check if type is missing)
  const userWeight = (profile as any)?.core?.weight || (profile as any)?.weight || 70;
  
  const runPace = formatPace(runDistance, elapsedTime);

  // ✅ FIX #2: Address Search with Debounce
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    // Debounce search
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        console.log('[useMapLogic] Searching for:', searchQuery);
        const results = await MapboxService.searchAddress(searchQuery);
        console.log('[useMapLogic] Search results:', results);
        setSuggestions(results);
      } catch (error) {
        console.error('[useMapLogic] Search error:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Effects
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentUserPos(loc);
        setUserLocation(loc);
      });
    }
  }, []);

  // ✅ FIX: Timer - removed argument from updateDuration()
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused || !workoutStartTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const seconds = Math.floor((now - workoutStartTime) / 1000);
      setElapsedTime(seconds);
      updateDuration(); // Fixed: No arguments passed
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive, isWorkoutPaused, workoutStartTime]);

  // ✅ FIX: WatchPosition - removed distanceFilter (not supported in web)
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused) {
      if (workoutWatchId) { navigator.geolocation.clearWatch(workoutWatchId); setWorkoutWatchId(null); }
      return;
    }
    const id = navigator.geolocation.watchPosition((pos) => {
      const newLat = pos.coords.latitude;
      const newLng = pos.coords.longitude;
      
      if (currentUserPos) {
         const dist = getDistanceFromLatLonInKm(currentUserPos.lat, currentUserPos.lng, newLat, newLng);
         // Manual filtering: 15 meters threshold to avoid jitter
         if (dist > 0.015) { 
             setRunDistance(prev => prev + dist);
             setLivePath(prev => [...prev, [newLng, newLat]]);
             addCoord([newLng, newLat]);
             
             // ✅ Sync distance delta to RunStore for RunSummary
             if (status === 'running') {
               updateRunData(dist);
             }
         }
      }
      const newLoc = { lat: newLat, lng: newLng };
      setCurrentUserPos(newLoc);
      setUserLocation(newLoc);
      if (pos.coords.heading) setUserBearing(pos.coords.heading);
    }, null, { enableHighAccuracy: true, maximumAge: 0 }); // Fixed options

    setWorkoutWatchId(id);
    return () => navigator.geolocation.clearWatch(id);
  }, [isWorkoutActive, isWorkoutPaused, currentUserPos, status, runDistance]);

  const startActiveWorkout = () => {
    if (currentUserPos) {
      setWorkoutStartTime(Date.now());
      setIsWorkoutActive(true);
      setIsNavigationMode(true);
      setRunDistance(0);
      setElapsedTime(0);
      
      const isMockRoute = focusedRoute?.id?.startsWith('mock') || false;
      
      if (focusedRoute && focusedRoute.path && focusedRoute.path.length > 2 && !isMockRoute && workoutMode !== 'free') {
        setLivePath(focusedRoute.path);
      } else {
        setLivePath([[currentUserPos.lng, currentUserPos.lat]]);
      }
      startRun();
    }
  };

  const routesToDisplay = useMemo(() => {
      if (navState === 'navigating' && navigationRoutes[selectedNavActivity]) return [navigationRoutes[selectedNavActivity]!];
      return filteredRoutes;
  }, [navState, navigationRoutes, selectedNavActivity, filteredRoutes]);

  // ✅ FIX #3: Shuffle handler with route regeneration
  const handleShuffle = useCallback(async (activity?: ActivityType) => {
    if (!currentUserPos) {
      console.warn('[useMapLogic] Cannot shuffle: no location');
      return;
    }

    console.log('[useMapLogic] Shuffling routes...');
    setIsGeneratingRoutes(true);

    // Increment generation index for variety
    const newIndex = routeGenerationIndex + 1;
    setRouteGenerationIndex(newIndex);

    try {
      // Clear old routes
      setAllRoutes([]);
      setFocusedRoute(null);
      setSelectedRoute(null);

      // Generate new routes
      const targetDistance = (preferences.duration || 30) * ((preferences.activity === 'cycling' ? 20 : 6) / 60);

      const newRoutes = await generateDynamicRoutes({
        userLocation: currentUserPos,
        targetDistance,
        activity: activity || preferences.activity || 'running',
        routeGenerationIndex: newIndex,
        preferences: {
          includeStrength: preferences.includeStrength || false,
          surface: preferences.surface as 'road' | 'trail'
        },
        parks: MOCK_PARKS
      });

      console.log(`[useMapLogic] Generated ${newRoutes.length} new routes`);

      if (newRoutes.length > 0) {
        setAllRoutes(newRoutes);
        // Auto-select the first route
        setFocusedRoute(newRoutes[0]);
      } else {
        // Fallback to mock routes if generation failed
        setAllRoutes(MOCK_ROUTES);
        if (MOCK_ROUTES.length > 0) {
          setFocusedRoute(MOCK_ROUTES[0]);
        }
      }
    } catch (error) {
      console.error('[useMapLogic] Shuffle error:', error);
      setAllRoutes(MOCK_ROUTES);
    } finally {
      setIsGeneratingRoutes(false);
    }
  }, [currentUserPos, routeGenerationIndex, preferences]);

  // Address Selection & Navigation Routes
  const handleAddressSelect = async (addr: { text: string; coords: [number, number] }) => {
    console.log('[useMapLogic] Address selected:', addr);
    setNavState('navigating');
    setSelectedAddress(addr);
    setSearchQuery('');
    setSuggestions([]);
    await fetchAllNavigationRoutes(addr);
  };

  const fetchAllNavigationRoutes = async (address: { text: string; coords: [number, number] }) => {
    if (!currentUserPos || !address?.coords) {
      console.error('[useMapLogic] Invalid address or location');
      return;
    }

    const [destLng, destLat] = address.coords;
    const destLocation = { lat: destLat, lng: destLng };
    const modes: ActivityType[] = ['walking', 'running', 'cycling'];

    const newRoutes: Record<string, Route | null> = { walking: null, running: null, cycling: null, workout: null };

    for (const mode of modes) {
      try {
        const result = await MapboxService.getSmartPath(
          currentUserPos,
          destLocation,
          mode === 'cycling' ? 'cycling' : 'walking',
          []
        );

        if (result && result.path.length > 0) {
          const distanceKm = result.distance / 1000;
          const durationMin = Math.round(result.duration / 60);

          const route: Route = {
            id: `nav-${mode}-${Date.now()}`,
            name: `מסלול ל${address.text || 'יעד נבחר'}`,
            description: `ניווט ${mode === 'running' ? 'בריצה' : mode === 'cycling' ? 'באופניים' : 'בהליכה'}`,
            distance: parseFloat(distanceKm.toFixed(1)),
            duration: durationMin,
            score: Math.round(distanceKm * 60),
            rating: 5,
            calories: Math.round(distanceKm * 60),
            type: mode,
            activityType: mode,
            difficulty: 'easy',
            path: result.path,
            segments: [],
            features: {
              hasGym: false, hasBenches: true, lit: true, scenic: true,
              terrain: 'road', environment: 'urban', trafficLoad: 'medium', surface: 'asphalt'
            },
            source: { type: 'system', name: 'Navigation' }
          };
          newRoutes[mode] = route;
        }
      } catch (error) {
        console.error(`[useMapLogic] Failed to fetch ${mode} route:`, error);
      }
    }

    setNavigationRoutes(newRoutes as any);

    const defaultRoute = newRoutes[selectedNavActivity] || newRoutes['walking'];
    if (defaultRoute) {
      setFocusedRoute(defaultRoute);
      setSelectedRoute(defaultRoute);
    }
  };

  const handleAICoachRequest = async (p: string) => {
        setIsAILoading(true);
        setChatMessages(prev => [...prev, { role: 'user', text: p }]);
        try {
            const response = await getAIRecommendation(p);
            setChatMessages(prev => [...prev, { role: 'coach', text: response }]);
            setIsChatOpen(true);
        } catch (error) {
            setChatMessages(prev => [...prev, { role: 'coach', text: 'שגיאה' }]);
        } finally {
            setIsAILoading(false);
        }
  }; 
  const handleLocationClick = () => triggerUserLocation();
  const handleActivityChange = (t: any) => updateFilter({ activity: t });


  return {
    currentUserPos, isFollowing, status, 
    routeGenerationIndex, allRoutes, smartPaths, loadingRouteIds,
    selectedRoute, focusedRoute, workoutMode, navState, searchQuery, suggestions, selectedAddress,
    isFilterOpen, isChatOpen, chatMessages, isAILoading, navigationRoutes, selectedNavActivity,
    showDetailsDrawer, isNavigationMode, workoutStartTime, isWorkoutActive, isWorkoutPaused, livePath, showSummary, userBearing,
    preferences, isGenerating: isGenerating || isGeneratingRoutes, routesToDisplay, searchInputRef, userWeight,
    isSearching,
    
    // Exports
    runDistance, 
    runPace, 
    elapsedTime,

    setSearchQuery, setNavState, setIsFilterOpen, setIsChatOpen, setShowDetailsDrawer, setIsNavigationMode,
    setShowSummary, setIsWorkoutActive, setIsWorkoutPaused, setWorkoutStartTime,
    setSelectedRoute, setFocusedRoute, setWorkoutMode, setRouteGenerationIndex, setSmartPaths, setSelectedNavActivity,
    setSuggestions, setAllRoutes,
    updateFilter, startActiveWorkout, handleAddressSelect, handleAICoachRequest,
    fetchAllNavigationRoutes, handleLocationClick, handleActivityChange, handleShuffle,
    pauseRun, resumeRun, stopRun, triggerLap, triggerUserLocation, addCoord
  };
};