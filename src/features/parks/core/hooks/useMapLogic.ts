import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine';
import { useUserStore } from '@/features/user';
import { useRouteFilter } from './useRouteFilter';
import { MapboxService } from '../services/mapbox.service';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { getAIRecommendation } from '../services/ai-coach.service';
import { MOCK_ROUTES } from '../data/mock-routes';
import { MOCK_PARKS } from '../data/mock-locations';
import { Route, ActivityType } from '../types/route.types';
import { NavHubState } from '../components/NavigationHub';
import { ChatMessage } from '../components/ChatDrawer';

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
  const { triggerLap, addCoord, updateRunData } = useRunningPlayer();
  const { status, startSession, pauseSession, resumeSession, endSession, updateDistance } = useSessionStore();
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
  const [isFollowing, setIsFollowing] = useState(false); // Track if map is following user location
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [livePath, setLivePath] = useState<[number, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showDopamine, setShowDopamine] = useState(false);
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

  // ✅ AUTOMATIC STARTUP: Immediate geolocation on mount (if permission already granted)
  const hasRequestedLocation = useRef(false);
  const hasGeneratedInitialRoutes = useRef(false);
  
  // Fallback location: Tel Aviv center (if GPS unavailable)
  const FALLBACK_LOCATION = { lat: 32.0853, lng: 34.7818 };

  useEffect(() => {
    if (hasRequestedLocation.current || typeof window === 'undefined' || !('geolocation' in navigator)) {
      // Set fallback location if geolocation is not available
      if (!currentUserPos) {
        setCurrentUserPos(FALLBACK_LOCATION);
      }
      return;
    }
    
    hasRequestedLocation.current = true;
    
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentUserPos(loc);
          
          // Auto-generate routes immediately after getting location
          if (!hasGeneratedInitialRoutes.current && workoutMode !== 'free') {
            hasGeneratedInitialRoutes.current = true;
            
            // Generate routes asynchronously
            setTimeout(async () => {
              try {
                const targetDistance = (preferences.duration || 30) * ((preferences.activity === 'cycling' ? 20 : 6) / 60);
                const newRoutes = await generateDynamicRoutes({
                  userLocation: loc,
                  targetDistance,
                  activity: preferences.activity || 'running',
                  routeGenerationIndex: 0,
                  preferences: {
                    includeStrength: preferences.includeStrength || false,
                    surface: preferences.surface as 'road' | 'trail'
                  },
                  parks: MOCK_PARKS
                });

                if (newRoutes.length > 0) {
                  setAllRoutes(newRoutes);
                  setFocusedRoute(newRoutes[0]);
                  setSelectedRoute(newRoutes[0]);
                } else {
                  // Fallback to mock routes
                  setAllRoutes(MOCK_ROUTES);
                  if (MOCK_ROUTES.length > 0) {
                    setFocusedRoute(MOCK_ROUTES[0]);
                    setSelectedRoute(MOCK_ROUTES[0]);
                  }
                }
              } catch (error) {
                console.error('[useMapLogic] Auto-route generation error:', error);
                // Fallback to mock routes on error
                setAllRoutes(MOCK_ROUTES);
                if (MOCK_ROUTES.length > 0) {
                  setFocusedRoute(MOCK_ROUTES[0]);
                  setSelectedRoute(MOCK_ROUTES[0]);
                }
              }
            }, 100); // Small delay to ensure state is set
          }
        },
        (error) => {
          // Graceful fallback: Use default location instead of crashing
          console.warn('[useMapLogic] Geolocation unavailable (code:', error.code, '). Using fallback location.');
          setCurrentUserPos(FALLBACK_LOCATION);
          setLocationError(error.message);
          
          // Still generate routes with fallback location
          if (!hasGeneratedInitialRoutes.current && workoutMode !== 'free') {
            hasGeneratedInitialRoutes.current = true;
            setTimeout(async () => {
              try {
                const targetDistance = (preferences.duration || 30) * ((preferences.activity === 'cycling' ? 20 : 6) / 60);
                const newRoutes = await generateDynamicRoutes({
                  userLocation: FALLBACK_LOCATION,
                  targetDistance,
                  activity: preferences.activity || 'running',
                  routeGenerationIndex: 0,
                  preferences: {
                    includeStrength: preferences.includeStrength || false,
                    surface: preferences.surface as 'road' | 'trail'
                  },
                  parks: MOCK_PARKS
                });

                if (newRoutes.length > 0) {
                  setAllRoutes(newRoutes);
                  setFocusedRoute(newRoutes[0]);
                  setSelectedRoute(newRoutes[0]);
                } else {
                  setAllRoutes(MOCK_ROUTES);
                  if (MOCK_ROUTES.length > 0) {
                    setFocusedRoute(MOCK_ROUTES[0]);
                    setSelectedRoute(MOCK_ROUTES[0]);
                  }
                }
              } catch (err) {
                console.error('[useMapLogic] Route generation with fallback failed:', err);
                setAllRoutes(MOCK_ROUTES);
                if (MOCK_ROUTES.length > 0) {
                  setFocusedRoute(MOCK_ROUTES[0]);
                  setSelectedRoute(MOCK_ROUTES[0]);
                }
              }
            }, 100);
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    } catch (err) {
      // Final safety net: if geolocation API itself throws, use fallback
      console.warn('[useMapLogic] Geolocation API error:', err);
      if (!currentUserPos) {
        setCurrentUserPos(FALLBACK_LOCATION);
      }
    }
  }, []); // Run once on mount

  // ✅ Timer - updates elapsed time locally and syncs session duration
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused || !workoutStartTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const seconds = Math.floor((now - workoutStartTime) / 1000);
      setElapsedTime(seconds);
      // Also tick the global session store so totalDuration updates
      try {
        useSessionStore.getState().tick();
      } catch (e) {
        console.warn('[useMapLogic] Failed to tick session store', e);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive, isWorkoutPaused, workoutStartTime]);

  // ✅ FIX: WatchPosition - removed distanceFilter (not supported in web)
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused) {
      if (workoutWatchId && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(workoutWatchId);
        } catch (e) {
          console.warn('[useMapLogic] Error clearing watch:', e);
        }
        setWorkoutWatchId(null);
      }
      return;
    }

    // Safety check: ensure geolocation is available
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      console.warn('[useMapLogic] Geolocation not available during workout');
      return;
    }

    let id: number | null = null;
    
    try {
      id = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;

          const prev = currentUserPos;
          const hasPrev = !!prev;

          // Only update if we have a previous point and the delta is significant
          if (hasPrev) {
            const dist = getDistanceFromLatLonInKm(prev.lat, prev.lng, newLat, newLng);
            // Manual filtering: 15 meters threshold to avoid jitter
            if (dist > 0.015) {
              setRunDistance(prevDist => prevDist + dist);
              setLivePath(prevPath => [...prevPath, [newLng, newLat]]);
              addCoord([newLng, newLat]);

              // ✅ Sync distance delta to RunningPlayer and SessionStore
              if (status === 'running' || status === 'active') {
                updateRunData(dist, elapsedTime);
                updateDistance(dist); // Update global session store
              }

              const newLoc = { lat: newLat, lng: newLng };
              setCurrentUserPos(newLoc);
              if (pos.coords.heading) setUserBearing(pos.coords.heading);
            }
          } else {
            // First point: seed location & live path without incrementing distance
            const seedLoc = { lat: newLat, lng: newLng };
            setCurrentUserPos(seedLoc);
            setLivePath([[newLng, newLat]]);
            if (pos.coords.heading) setUserBearing(pos.coords.heading);
          }
        },
        (error) => {
          // Graceful error handling: log but don't crash
          console.warn('[useMapLogic] watchPosition error (code:', error.code, '):', error.message);
          // Don't clear the watch on error - let it retry
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );

      setWorkoutWatchId(id);
    } catch (err) {
      console.error('[useMapLogic] Failed to start watchPosition:', err);
    }

    return () => {
      if (id !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(id);
        } catch (e) {
          console.warn('[useMapLogic] Error clearing watch on cleanup:', e);
        }
      }
    };
  }, [isWorkoutActive, isWorkoutPaused, currentUserPos, status, runDistance]);

  const startActiveWorkout = () => {
    // Always start unified workout session (running)
    startSession('running');

    // Tell the running player to show the Free Run UI
    useRunningPlayer.getState().setRunMode('free');

    setWorkoutStartTime(Date.now());
    setIsWorkoutActive(true);
    setIsNavigationMode(true);
    setRunDistance(0);
    setElapsedTime(0);
    
    const isMockRoute = focusedRoute?.id?.startsWith('mock') || false;
    
    if (focusedRoute && focusedRoute.path && focusedRoute.path.length > 2 && !isMockRoute && workoutMode !== 'free') {
      setLivePath(focusedRoute.path);
    } else if (currentUserPos) {
      setLivePath([[currentUserPos.lng, currentUserPos.lat]]);
    } else {
      // No location yet – start without a seeded path
      setLivePath([]);
    }
  };

  const routesToDisplay = useMemo(() => {
      if (navState === 'navigating' && navigationRoutes[selectedNavActivity]) return [navigationRoutes[selectedNavActivity]!];
      return filteredRoutes;
  }, [navState, navigationRoutes, selectedNavActivity, filteredRoutes]);

  // ✅ AUTO-FOCUS & DRAW FIRST ROUTE when suggestions are ready
  useEffect(() => {
    if (!routesToDisplay || routesToDisplay.length === 0) return;
    if (focusedRoute) return;

    const first = routesToDisplay[0];
    if (!first || !first.path || first.path.length < 2) return;

    setFocusedRoute(first);
    setSelectedRoute(first);

    // Pre-seed livePath so the route is visible as soon as workout starts
    if (!isWorkoutActive) {
      setLivePath(first.path as [number, number][]);
    }
  }, [routesToDisplay, focusedRoute, isWorkoutActive]);

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
  const handleLocationClick = () => {
    if (!('geolocation' in navigator)) return;
    // Toggle following state
    setIsFollowing(prev => !prev);
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCurrentUserPos(loc);
    });
  };
  const handleActivityChange = (t: any) => updateFilter({ activity: t });


  return {
    currentUserPos, status, 
    routeGenerationIndex, allRoutes, smartPaths, loadingRouteIds,
    selectedRoute, focusedRoute, workoutMode, navState, searchQuery, suggestions, selectedAddress,
    isFilterOpen, isChatOpen, chatMessages, isAILoading, navigationRoutes, selectedNavActivity,
    showDetailsDrawer, isNavigationMode, isFollowing, workoutStartTime, isWorkoutActive, isWorkoutPaused, livePath, showSummary, showDopamine, userBearing,
    preferences, isGenerating: isGenerating || isGeneratingRoutes, routesToDisplay, searchInputRef, userWeight,
    isSearching,
    
    // Exports
    runDistance, 
    runPace, 
    elapsedTime,

    setSearchQuery, setNavState, setIsFilterOpen, setIsChatOpen, setShowDetailsDrawer, setIsNavigationMode,
    setShowSummary, setShowDopamine, setIsWorkoutActive, setIsWorkoutPaused, setWorkoutStartTime,
    setSelectedRoute, setFocusedRoute, setWorkoutMode, setRouteGenerationIndex, setSmartPaths, setSelectedNavActivity,
    setSuggestions, setAllRoutes,
    updateFilter, startActiveWorkout, handleAddressSelect, handleAICoachRequest,
    fetchAllNavigationRoutes, handleLocationClick, handleActivityChange, handleShuffle,
    pauseSession, resumeSession, endSession, triggerLap, addCoord
  };
};