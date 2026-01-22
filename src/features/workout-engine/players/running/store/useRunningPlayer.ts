/**
 * Running Player Store
 * Manages running-specific state (laps, GPS, pace)
 * Works alongside useSessionStore for universal metrics
 */
import { create } from 'zustand';
import { Route } from '@/features/parks';
import { Lap, GeoPoint } from '../../../core/types/session.types';
import { watchPosition, clearWatch, calculateDistance } from '@/lib/services/location.service';

export interface WorkoutSettings {
  autoLapMode: 'distance' | 'time' | 'off';
  autoLapValue: number; // Distance in km (0.1-2.0) or Time in minutes (1-10)
  enableAudio: boolean;
  enableAutoPause: boolean;
  enableCountdown: boolean;
}

interface RunningPlayerState {
  // Running Mode
  runMode: 'free' | 'plan' | 'my_routes';
  activityType: 'running' | 'walking';
  
  // Running-specific Metrics
  laps: Lap[];
  currentPace: number;  // minutes per km
  routeCoords: number[][];
  lastPosition: { lat: number; lng: number } | null;
  totalCalories: number; // Real-time calculated calories
  
  // Route Planning
  suggestedRoutes: Route[];
  activeRoutePath: number[][];
  
  // Map View State
  view: 'main' | 'laps';
  lastViewport: { latitude: number; longitude: number; zoom: number };
  
  // Snapshot State
  isSnapshotVisible: boolean;
  lastCompletedLap: Lap | null;
  
  // Workout Settings
  settings: WorkoutSettings;
  
  // GPS Tracking
  gpsWatchId: number | null;
  durationIntervalId: NodeJS.Timeout | null;
  wakeLock: WakeLockSentinel | null; // Screen wake lock to prevent phone from sleeping
  gpsAccuracy: number | null; // Current GPS accuracy in meters
  gpsStatus: 'searching' | 'poor' | 'good' | 'perfect'; // GPS signal status
  
  // Actions
  setRunMode: (mode: 'free' | 'plan' | 'my_routes') => void;
  setActivityType: (type: 'running' | 'walking') => void;
  setSuggestedRoutes: (routes: Route[]) => void;
  setActiveRoutePath: (path: number[][]) => void;
  setView: (view: 'main' | 'laps') => void;
  setLastViewport: (vp: any) => void;
  
  triggerLap: () => void;
  addManualLap: () => void;
  addCoord: (coord: number[]) => void;
  updatePace: (pace: number) => void;
  updateRunData: (distanceDelta: number, duration: number) => void;
  
  showSnapshot: (lap: Lap) => void;
  hideSnapshot: () => void;
  
  updateSettings: (settings: Partial<WorkoutSettings>) => void;
  
  startGPSTracking: () => void;
  stopGPSTracking: () => void;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => void;
  
  initializeRunningData: () => void;
  clearRunningData: () => void;
  finishWorkout: () => Promise<void>;
}

export const useRunningPlayer = create<RunningPlayerState>((set, get) => ({
  // Initial state - start with empty arrays to prevent mock data from appearing
  runMode: 'plan',
  activityType: 'running',
  laps: [], // Start empty - will be initialized when workout starts
  currentPace: 0,
  routeCoords: [], // Start empty - prevents old paths from appearing
  lastPosition: null,
  totalCalories: 0, // Start with 0 calories
  suggestedRoutes: [],
  activeRoutePath: [],
  view: 'main',
  lastViewport: { latitude: 32.0853, longitude: 34.7818, zoom: 15 },
  isSnapshotVisible: false,
  lastCompletedLap: null,
  settings: {
    autoLapMode: 'off',
    autoLapValue: 1.0, // Default 1 km for distance mode
    enableAudio: false,
    enableAutoPause: false,
    enableCountdown: false,
  },
  gpsWatchId: null,
  durationIntervalId: null,
  wakeLock: null,
  gpsAccuracy: null,
  gpsStatus: 'searching',
  
  // Setters
  setRunMode: (mode) => set({ runMode: mode }),
  setActivityType: (type) => set({ activityType: type }),
  setSuggestedRoutes: (routes) => set({ suggestedRoutes: routes }),
  setActiveRoutePath: (path) => set({ activeRoutePath: path }),
  setView: (view) => set({ view }),
  setLastViewport: (vp) => set({ lastViewport: vp }),
  
  // Trigger a new lap
  triggerLap: () => {
    const { laps, settings } = get();
    
    // Find and save the completed lap data BEFORE marking it inactive
    const activeLap = laps.find(lap => lap.isActive);
    const completedLapData = activeLap ? { ...activeLap } : null;
    
    // Mark all existing laps as inactive
    const updatedLaps = laps.map(lap => ({ ...lap, isActive: false }));
    
    // Create new active lap
    const newLapNumber = laps.length + 1;
    updatedLaps.push({
      id: newLapNumber.toString(),
      lapNumber: newLapNumber,
      distanceMeters: 0,
      durationSeconds: 0,
      splitPace: 0,
      isActive: true
    });
    
    set({ laps: updatedLaps });
    
    // Show snapshot if we have a completed lap with data
    if (completedLapData && completedLapData.distanceMeters > 0) {
      // Save the completed lap and show snapshot
      set({ lastCompletedLap: completedLapData });
      get().showSnapshot(completedLapData);
      
      // Audio announcement if enabled
      if (settings.enableAudio && typeof window !== 'undefined') {
        import('@/features/workout-engine/core/services/AudioService').then(({ audioService }) => {
          const lapDistanceKm = completedLapData.distanceMeters / 1000;
          const pace = completedLapData.splitPace || 0;
          const time = completedLapData.durationSeconds || 0;
          audioService.announceLap(
            completedLapData.lapNumber,
            lapDistanceKm,
            pace,
            time
          );
        });
      }
    }
  },

  // Add manual lap (for debugging/testing)
  addManualLap: () => {
    const { laps } = get();
    
    // If no laps exist, create the first lap with test data
    if (!laps || laps.length === 0) {
      const firstLap = {
        id: '1',
        lapNumber: 1,
        distanceMeters: 1000, // 1 km for testing
        durationSeconds: 300, // 5 minutes for testing
        splitPace: 5.0, // 5:00 min/km
        isActive: true
      };
      set({ laps: [firstLap] });
      console.log('[useRunningPlayer] Created first lap manually with test data');
      return;
    }
    
    // Find and save the completed lap before marking it inactive
    const activeLap = laps.find(lap => lap.isActive);
    
    // If active lap has no data, add test data for demonstration
    let completedLap = activeLap ? { ...activeLap } : null;
    if (completedLap && completedLap.distanceMeters === 0) {
      // Add test data to make snapshot visible
      completedLap = {
        ...completedLap,
        distanceMeters: 1000 + (completedLap.lapNumber * 100), // Varying test distances
        durationSeconds: 300 + (completedLap.lapNumber * 10), // Varying test times
        splitPace: 5.0 + (completedLap.lapNumber * 0.1), // Varying test paces
      };
    }
    
    // Mark all existing laps as inactive
    const updatedLaps = laps.map(lap => 
      lap.isActive ? { ...lap, isActive: false } : lap
    );
    
    // If we modified the completed lap, update it in the array
    if (completedLap && activeLap) {
      const lapIndex = updatedLaps.findIndex(l => l.id === activeLap.id);
      if (lapIndex !== -1) {
        updatedLaps[lapIndex] = { ...completedLap, isActive: false };
      }
    }
    
    // Create new active lap
    const newLapNumber = laps.length + 1;
    updatedLaps.push({
      id: newLapNumber.toString(),
      lapNumber: newLapNumber,
      distanceMeters: 0,
      durationSeconds: 0,
      splitPace: 0,
      isActive: true
    });
    
    set({ laps: updatedLaps });
    console.log('[useRunningPlayer] Manual lap added:', newLapNumber, 'Total laps:', updatedLaps.length);
    
    // Show snapshot if we have a completed lap
    if (completedLap) {
      // Save the completed lap data first
      set({ lastCompletedLap: completedLap });
      get().showSnapshot(completedLap);
      
      // Audio announcement if enabled
      const { settings } = get();
      if (settings.enableAudio && typeof window !== 'undefined') {
        import('@/features/workout-engine/core/services/AudioService').then(({ audioService }) => {
          const lapDistanceKm = completedLap.distanceMeters / 1000;
          const pace = completedLap.splitPace || 0;
          const time = completedLap.durationSeconds || 0;
          audioService.announceLap(
            completedLap.lapNumber,
            lapDistanceKm,
            pace,
            time
          );
        });
      }
    }
  },
  
  // Show snapshot overlay
  showSnapshot: (lap: Lap) => {
    set({
      isSnapshotVisible: true,
      lastCompletedLap: lap,
    });
  },
  
  // Hide snapshot overlay
  hideSnapshot: () => {
    set({
      isSnapshotVisible: false,
    });
  },
  
  // Update workout settings
  updateSettings: (newSettings: Partial<WorkoutSettings>) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ...newSettings,
      },
    }));
  },

  // Request screen wake lock to prevent phone from sleeping during workout
  requestWakeLock: async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      console.warn('[useRunningPlayer] Wake Lock API not available');
      return;
    }

    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      set({ wakeLock });
      console.log('[useRunningPlayer] ✅ Screen wake lock acquired');

      // Handle wake lock release (e.g., when user switches tabs)
      wakeLock.addEventListener('release', () => {
        console.log('[useRunningPlayer] Wake lock released');
        set({ wakeLock: null });
      });
    } catch (error: any) {
      console.warn('[useRunningPlayer] Failed to acquire wake lock:', error.message);
      // Continue without wake lock - not critical
    }
  },

  // Release screen wake lock
  releaseWakeLock: () => {
    const { wakeLock } = get();
    if (wakeLock) {
      try {
        wakeLock.release();
        set({ wakeLock: null });
        console.log('[useRunningPlayer] ✅ Screen wake lock released');
      } catch (error) {
        console.warn('[useRunningPlayer] Error releasing wake lock:', error);
      }
    }
  },

  // Start GPS tracking with industry-standard settings
  startGPSTracking: () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      console.warn('[useRunningPlayer] Geolocation not available');
      return;
    }

    const { stopGPSTracking, requestWakeLock } = get();
    // Stop any existing tracking
    stopGPSTracking();

    // Initialize GPS status to searching
    set({ gpsStatus: 'searching', gpsAccuracy: null });

    // Request wake lock to prevent phone from sleeping
    requestWakeLock();

    let lastPos: { lat: number; lng: number } | null = null;
    const DISTANCE_THRESHOLD = 5; // Only add point if > 5 meters from last point

    // Watch position using location service with accuracy filtering
    const watchId = watchPosition(
      (location) => {
        const { lat, lng, accuracy } = location;
        const currentPos = { lat, lng };

        // Determine GPS status based on accuracy
        let gpsStatus: 'searching' | 'poor' | 'good' | 'perfect';
        if (accuracy <= 10) {
          gpsStatus = 'perfect';
        } else if (accuracy <= 30) {
          gpsStatus = 'good';
        } else {
          gpsStatus = 'poor';
        }

        // Update GPS accuracy and status in store
        set({ gpsAccuracy: accuracy, gpsStatus });

        // Calculate distance delta from last position
        if (lastPos) {
          const distanceDelta = calculateDistance(lastPos.lat, lastPos.lng, lat, lng);
          
          // Only update if distance is significant (filter GPS noise and stationary points)
          if (distanceDelta > DISTANCE_THRESHOLD) {
            // Update route coordinates (Mapbox format: [lng, lat])
            get().addCoord([lng, lat]);
            
            // Update running data (convert meters to km)
            const distanceDeltaKm = distanceDelta / 1000;
            const { laps } = get();
            const activeLap = laps.find(l => l.isActive);
            const currentDuration = activeLap?.durationSeconds || 0;
            
            get().updateRunData(distanceDeltaKm, currentDuration);
            
            console.log(`[GPS] Position added: ${distanceDelta.toFixed(1)}m from last, accuracy: ${accuracy.toFixed(1)}m`);
          } else {
            console.log(`[GPS] Position skipped: ${distanceDelta.toFixed(1)}m < ${DISTANCE_THRESHOLD}m threshold`);
          }
        } else {
          // First position - always add to route
          get().addCoord([lng, lat]);
          console.log(`[GPS] First position: accuracy ${accuracy.toFixed(1)}m`);
        }

        lastPos = currentPos;
        set({ lastPosition: currentPos });
      },
      (error) => {
        console.error('[useRunningPlayer] GPS error:', error.code, error.message);
        // Set status to searching on error
        set({ gpsStatus: 'searching', gpsAccuracy: null });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
        accuracyThreshold: 25, // Only accept positions with accuracy <= 25 meters
      }
    );

    // Update duration every second and check for auto-lap
    const durationInterval = setInterval(() => {
      const { laps, settings } = get();
      const activeLap = laps.find(l => l.isActive);
      
      if (activeLap) {
        const newDuration = activeLap.durationSeconds + 1;
        
        // Update duration
        let updatedLaps = laps.map(lap =>
          lap.isActive
            ? { ...lap, durationSeconds: newDuration }
            : lap
        );
        
        // Check for time-based auto-lap
        if (settings.autoLapMode === 'time' && settings.autoLapValue > 0) {
          const thresholdSeconds = settings.autoLapValue * 60;
          const currentLap = updatedLaps.find(l => l.isActive);
          
          if (currentLap) {
            console.log(`[Auto-Lap] Checking Time: Current ${currentLap.durationSeconds}s vs Target ${thresholdSeconds}s`);
            
            if (currentLap.durationSeconds >= thresholdSeconds) {
              console.log(`[Auto-Lap] Time threshold reached! Triggering lap.`);
              // Trigger lap automatically
              get().triggerLap();
              return; // Exit early since triggerLap will update state
            }
          }
        }
        
        set({ laps: updatedLaps });
      }
    }, 1000);

    set({ gpsWatchId: watchId, durationIntervalId: durationInterval });
  },

  // Stop GPS tracking
  stopGPSTracking: () => {
    const { gpsWatchId, durationIntervalId, releaseWakeLock } = get();
    
    // Clear GPS watch
    if (gpsWatchId !== null) {
      clearWatch(gpsWatchId);
    }
    
    // Clear duration interval
    if (durationIntervalId !== null) {
      clearInterval(durationIntervalId);
    }
    
    // Release wake lock
    releaseWakeLock();
    
    // Reset GPS status
    set({ 
      gpsWatchId: null, 
      durationIntervalId: null,
      gpsAccuracy: null,
      gpsStatus: 'searching',
    });
  },
  
  // Add GPS coordinate
  addCoord: (coord) => {
    set((state) => ({
      routeCoords: [...state.routeCoords, coord]
    }));
  },
  
  // Update pace
  updatePace: (pace) => {
    set({ currentPace: pace });
  },
  
  // Update running data (called when distance changes)
  updateRunData: (distanceDelta: number, duration: number) => {
    const { laps, settings } = get();
    const distanceDeltaMeters = distanceDelta * 1000;
    
    // Calculate pace
    const pace = distanceDelta > 0 ? (duration / 60) / distanceDelta : 0;
    
    // Get total distance from session store (it tracks cumulative distance)
    let totalDistanceKm = 0;
    if (typeof window !== 'undefined') {
      try {
        const { useSessionStore } = require('@/features/workout-engine/core/store/useSessionStore');
        const sessionState = useSessionStore.getState();
        totalDistanceKm = sessionState.totalDistance || 0;
      } catch (error) {
        // Fallback: if session store unavailable, use 0
        totalDistanceKm = 0;
      }
    }
    
    // Calculate calories: Calories = Distance (km) × Weight (kg) × 1.036
    // Get user weight from store (default 70kg if not available)
    let userWeight = 70;
    if (typeof window !== 'undefined') {
      try {
        const { useUserStore } = require('@/features/user/identity/store/useUserStore');
        const userState = useUserStore.getState();
        userWeight = userState.profile?.core?.weight || 70;
      } catch (error) {
        // Fallback to default weight
      }
    }
    
    const calculatedCalories = Math.round(totalDistanceKm * userWeight * 1.036);
    
    // If no laps exist, initialize the first lap
    let updatedLaps = laps.length === 0 
      ? [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }]
      : laps;
    
    // Update active lap
    updatedLaps = updatedLaps.map(lap => 
      lap.isActive ? {
        ...lap,
        distanceMeters: lap.distanceMeters + distanceDeltaMeters,
        durationSeconds: duration,
        splitPace: pace
      } : lap
    );
    
    // Check for distance-based auto-lap trigger
    if (settings.autoLapMode === 'distance' && settings.autoLapValue > 0) {
      const activeLap = updatedLaps.find(lap => lap.isActive);
      if (activeLap) {
        // Check if distance threshold reached (convert km to meters)
        const thresholdMeters = settings.autoLapValue * 1000;
        console.log(`[Auto-Lap] Checking Distance: Current ${activeLap.distanceMeters.toFixed(2)}m vs Target ${thresholdMeters}m`);
        
        if (activeLap.distanceMeters >= thresholdMeters) {
          console.log(`[Auto-Lap] Distance threshold reached! Triggering lap.`);
          // Trigger lap automatically
          get().triggerLap();
          return; // Exit early since triggerLap will update state
        }
      }
    }
    
    set({
      currentPace: pace,
      laps: updatedLaps,
      totalCalories: calculatedCalories
    });
  },
  
  // Initialize running data (called when workout starts)
  initializeRunningData: () => {
    set({
      laps: [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }],
      currentPace: 0,
      routeCoords: [], // Clear any old route data
      activeRoutePath: [], // Clear any old active route
    });
  },

  // Clear running data
  clearRunningData: () => {
    const { stopGPSTracking } = get();
    stopGPSTracking(); // Stop GPS tracking when clearing data
    
    set({
      laps: [], // Clear all laps
      currentPace: 0,
      routeCoords: [], // Clear route coordinates
      activeRoutePath: [], // Clear active route
      isSnapshotVisible: false,
      lastCompletedLap: null,
      lastPosition: null,
      totalCalories: 0, // Reset calories
    });
  },

  // Finish workout - stop tracking, log analytics, award rewards, SAVE TO DB, and set status to finished
  finishWorkout: async () => {
    const { stopGPSTracking, totalCalories, routeCoords, activityType, currentPace } = get();
    
    // Stop all timers and GPS tracking
    stopGPSTracking();
    
    // Get final stats from session store
    if (typeof window !== 'undefined') {
      try {
        const { useSessionStore } = await import('@/features/workout-engine/core/store/useSessionStore');
        const { saveWorkout } = await import('@/features/workout-engine/core/services/storage.service');
        const { auth } = await import('@/lib/firebase');
        const sessionState = useSessionStore.getState();
        
        // Use the calculated calories from the store (real-time calculation)
        const finalCalories = totalCalories || 0;
        
        // Get current user ID - CRITICAL for saving
        const currentUser = auth.currentUser;
        if (!currentUser) {
          console.error('❌ [useRunningPlayer] Cannot save workout: No User ID found');
        } else {
          // Ensure routePath is always an array (never undefined)
          const safeRoutePath = Array.isArray(routeCoords) && routeCoords.length > 0
            ? routeCoords.map(coord => [coord[0], coord[1]] as [number, number])
            : [];

          // Validate and ensure numeric values are valid (not NaN or undefined)
          const safeDistance = (typeof sessionState.totalDistance === 'number' && !isNaN(sessionState.totalDistance))
            ? sessionState.totalDistance
            : 0;
          const safeDuration = (typeof sessionState.totalDuration === 'number' && !isNaN(sessionState.totalDuration))
            ? sessionState.totalDuration
            : 0;
          const safeCalories = (typeof finalCalories === 'number' && !isNaN(finalCalories))
            ? finalCalories
            : 0;
          const safePace = (typeof currentPace === 'number' && !isNaN(currentPace))
            ? currentPace
            : 0;

          // Prepare workout data
          const workoutData = {
            userId: currentUser.uid,
            activityType: activityType || 'running',
            workoutType: 'running' as const,
            distance: safeDistance,
            duration: safeDuration,
            calories: safeCalories,
            pace: safePace,
            routePath: safeRoutePath, // Always an array, never undefined
            earnedCoins: safeCalories, // 1:1 ratio with calories
          };

          console.log('🚀 [useRunningPlayer] Attempting to save workout to DB...', workoutData);

          // Save workout to Firestore - WAIT for completion BEFORE proceeding
          try {
            const success = await saveWorkout(workoutData);
            if (success) {
              console.log('✅ [useRunningPlayer] Workout saved successfully to Firestore');
            } else {
              console.error('❌ [useRunningPlayer] Failed to save workout (saveWorkout returned false)');
            }
          } catch (saveError) {
            console.error('❌ [useRunningPlayer] Error saving workout to Firestore:', saveError);
          }
        }
        
        // Log workout complete event
        const { Analytics } = await import('@/features/analytics/AnalyticsService');
        const workoutId = `free-run-${Date.now()}`;
        await Analytics.logWorkoutComplete(
          workoutId,
          sessionState.totalDuration,
          finalCalories,
          finalCalories // earnedCoins = calories (1:1 ratio)
        ).catch((error) => {
          console.error('[useRunningPlayer] Error logging workout complete:', error);
        });
        
        // Award workout coins (coins = calories, 1:1 ratio)
        const { useProgressionStore } = await import('@/features/user/progression/store/useProgressionStore');
        const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
        const userState = useUserStore.getState();
        const userId = userState.profile?.id;
        
        if (userId && finalCalories > 0) {
          const progressionState = useProgressionStore.getState();
          // Award coins equal to calories
          await progressionState.awardWorkoutCoins(finalCalories).catch((error) => {
            console.error('[useRunningPlayer] Error awarding workout coins:', error);
          });
          
          // Mark today as completed (syncs to Firestore dailyProgress)
          await progressionState.markTodayAsCompleted('running').catch((error) => {
            console.error('[useRunningPlayer] Error marking today as completed:', error);
          });
        }
        
        // Set status to finished
        sessionState.endSession();
      } catch (error) {
        console.error('[useRunningPlayer] Error finishing workout:', error);
        // Still set status to finished even if analytics/rewards fail
        if (typeof window !== 'undefined') {
          const { useSessionStore } = await import('@/features/workout-engine/core/store/useSessionStore');
          useSessionStore.getState().endSession();
        }
      }
    }
  },
}));
