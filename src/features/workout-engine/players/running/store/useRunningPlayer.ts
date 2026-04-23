/**
 * Running Player Store
 * Manages running-specific state (laps, GPS, pace)
 * Works alongside useSessionStore for universal metrics
 */
import { create } from 'zustand';
import { Route } from '@/features/parks';
import { Lap, GeoPoint } from '../../../core/types/session.types';
import { watchPosition, clearWatch, calculateDistance } from '@/lib/services/location.service';
import type RunWorkout from '../types/run-workout.type';

export interface WorkoutSettings {
  autoLapMode: 'distance' | 'time' | 'off';
  autoLapValue: number;
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
  currentPace: number;
  routeCoords: number[][];
  routeZones: (string | null)[];
  lastPosition: { lat: number; lng: number } | null;
  totalCalories: number;
  
  // Route Planning
  suggestedRoutes: Route[];
  activeRoutePath: number[][];
  
  // Map View State
  view: 'main' | 'laps';
  lastViewport: { latitude: number; longitude: number; zoom: number };
  
  // Snapshot State
  isSnapshotVisible: boolean;
  lastCompletedLap: Lap | null;

  // Pace smoothing
  paceHistory: number[];

  // Map follow (Pillar 6)
  isMapFollowEnabled: boolean;
  
  // Workout Settings
  settings: WorkoutSettings;
  
  // GPS Tracking
  gpsWatchId: number | null;
  durationIntervalId: NodeJS.Timeout | null;
  wakeLock: WakeLockSentinel | null;
  gpsAccuracy: number | null;
  gpsStatus: 'searching' | 'poor' | 'good' | 'perfect' | 'simulated';
  // When true, real watchPosition is completely bypassed; sim positions drive the workout
  isSimulationActive: boolean;

  // ── Planned Run State ────────────────────────────────────────────
  currentWorkout: RunWorkout | null;
  currentBlockIndex: number;
  blockElapsedSeconds: number;
  blockElapsedMeters: number;
  blockSetNumber: number;
  totalBlockSets: number;
  
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

  // Map follow (Pillar 6)
  setMapFollowEnabled: (v: boolean) => void;

  // Simulation control — when active, real GPS is bypassed entirely
  setSimulationActive: (active: boolean) => void;

  // ── Planned Run Actions ──────────────────────────────────────────
  setCurrentWorkout: (workout: RunWorkout | null) => void;
  advanceBlock: () => void;
  jumpToBlock: (targetIndex: number) => void;
  tickBlockElapsed: () => void;
  addBlockDistance: (meters: number) => void;
  resetPlannedRun: () => void;
}

export const useRunningPlayer = create<RunningPlayerState>((set, get) => ({
  // Initial state - start with empty arrays to prevent mock data from appearing
  runMode: 'plan',
  activityType: 'running',
  laps: [], // Start empty - will be initialized when workout starts
  currentPace: 0,
  routeCoords: [],
  routeZones: [],
  lastPosition: null,
  totalCalories: 0, // Start with 0 calories
  suggestedRoutes: [],
  activeRoutePath: [],
  view: 'main',
  lastViewport: { latitude: 32.0853, longitude: 34.7818, zoom: 15 },
  isSnapshotVisible: false,
  lastCompletedLap: null,
  paceHistory: [],
  isMapFollowEnabled: true,
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
  isSimulationActive: false,

  // Planned Run Initial State
  currentWorkout: null,
  currentBlockIndex: 0,
  blockElapsedSeconds: 0,
  blockElapsedMeters: 0,
  blockSetNumber: 1,
  totalBlockSets: 1,
  
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

  // Start GPS tracking with industry-standard settings.
  // When isSimulationActive is true the real watchPosition is completely skipped —
  // only the duration interval runs so laps/time keep ticking.
  // Sim positions are injected externally via injectSimPosition (MapShell → useWorkoutSession).
  startGPSTracking: () => {
    const { stopGPSTracking, requestWakeLock, isSimulationActive } = get();

    // Stop any existing tracking first
    stopGPSTracking();

    // Request wake lock to prevent phone from sleeping
    if (typeof window !== 'undefined') requestWakeLock();

    // ── Shared: duration ticker (runs in both real and sim modes) ──────
    const durationInterval = setInterval(() => {
      const { laps, settings } = get();
      const activeLap = laps.find(l => l.isActive);
      if (!activeLap) return;

      const newDuration = activeLap.durationSeconds + 1;
      let updatedLaps = laps.map(lap =>
        lap.isActive ? { ...lap, durationSeconds: newDuration } : lap
      );

      if (settings.autoLapMode === 'time' && settings.autoLapValue > 0) {
        const thresholdSeconds = settings.autoLapValue * 60;
        const currentLap = updatedLaps.find(l => l.isActive);
        if (currentLap && currentLap.durationSeconds >= thresholdSeconds) {
          get().triggerLap();
          return;
        }
      }

      set({ laps: updatedLaps });
    }, 1000);

    // ── Simulation mode: bypass all real GPS entirely ──────────────────
    if (isSimulationActive) {
      console.log('[useRunningPlayer] 🎮 Simulation active — real GPS bypassed, using mock positions');
      set({
        gpsStatus: 'simulated',
        gpsAccuracy: 5,
        gpsWatchId: null,
        durationIntervalId: durationInterval,
      });
      return;
    }

    // ── Real GPS mode ──────────────────────────────────────────────────
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      console.warn('[useRunningPlayer] Geolocation not available');
      set({ durationIntervalId: durationInterval });
      return;
    }

    set({ gpsStatus: 'searching', gpsAccuracy: null });

    let lastPos: { lat: number; lng: number } | null = null;
    let lastTimestamp: number | null = null;
    const DISTANCE_THRESHOLD = 5;
    const MIN_SPEED_MS = 0.5;
    const MAX_PACE_MIN_KM = 15;

    const watchId = watchPosition(
      (location) => {
        // If simulation was enabled mid-workout, ignore any stale real callbacks
        if (get().isSimulationActive) return;

        const { lat, lng, accuracy } = location;
        const currentPos = { lat, lng };

        let gpsStatus: 'searching' | 'poor' | 'good' | 'perfect' | 'simulated';
        if (accuracy <= 10) gpsStatus = 'perfect';
        else if (accuracy <= 30) gpsStatus = 'good';
        else gpsStatus = 'poor';

        set({ gpsAccuracy: accuracy, gpsStatus });

        if (lastPos) {
          const distanceDelta = calculateDistance(lastPos.lat, lastPos.lng, lat, lng);

          if (distanceDelta > DISTANCE_THRESHOLD) {
            get().addCoord([lng, lat]);
            get().addBlockDistance(distanceDelta);

            try {
              const { useSessionStore } = require('@/features/workout-engine/core/store/useSessionStore');
              useSessionStore.getState().updateDistance(distanceDelta / 1000);
            } catch { /* session store unavailable */ }

            const now = Date.now();
            const timeDeltaSeconds = lastTimestamp ? (now - lastTimestamp) / 1000 : 0;

            if (timeDeltaSeconds > 0) {
              const speedMs = distanceDelta / timeDeltaSeconds;
              if (speedMs < MIN_SPEED_MS) {
                set({ currentPace: 0 });
              } else {
                const instantPaceMinKm = 1000 / (speedMs * 60);
                if (instantPaceMinKm <= MAX_PACE_MIN_KM) {
                  get().updateRunData(distanceDelta / 1000, instantPaceMinKm);
                }
              }
            }
            lastTimestamp = now;
          }
        } else {
          get().addCoord([lng, lat]);
          lastTimestamp = Date.now();
        }

        lastPos = currentPos;
        set({ lastPosition: currentPos });
      },
      (error) => {
        if (get().isSimulationActive) return; // ignore errors when sim took over
        console.error('[useRunningPlayer] GPS error:', error.code, error.message);
        set({ gpsStatus: 'searching', gpsAccuracy: null });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
        accuracyThreshold: 25,
      }
    );

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
  
  // Add GPS coordinate, tagged with the current block's zoneType if in planned run
  addCoord: (coord) => {
    const { currentWorkout, currentBlockIndex } = get();
    const zoneType = currentWorkout?.blocks?.[currentBlockIndex]?.zoneType ?? null;
    set((state) => ({
      routeCoords: [...state.routeCoords, coord],
      routeZones: [...state.routeZones, zoneType],
    }));
  },
  
  // Update pace
  updatePace: (pace) => {
    set({ currentPace: pace });
  },
  
  // Update running data with instantaneous pace (min/km) and distance delta (km)
  updateRunData: (distanceDeltaKm: number, instantPaceMinKm: number) => {
    const { laps, settings, paceHistory } = get();
    const distanceDeltaMeters = distanceDeltaKm * 1000;

    // 5-point weighted rolling average
    const newHistory = [...paceHistory.slice(-4), instantPaceMinKm];
    const weights = newHistory.map((_, i) => i + 1);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const smoothedPace = newHistory.reduce((sum, p, i) => sum + p * weights[i], 0) / weightSum;

    let totalDistanceKm = 0;
    if (typeof window !== 'undefined') {
      try {
        const { useSessionStore } = require('@/features/workout-engine/core/store/useSessionStore');
        totalDistanceKm = useSessionStore.getState().totalDistance || 0;
      } catch { totalDistanceKm = 0; }
    }

    let userWeight = 70;
    if (typeof window !== 'undefined') {
      try {
        const { useUserStore } = require('@/features/user/identity/store/useUserStore');
        userWeight = useUserStore.getState().profile?.core?.weight || 70;
      } catch { /* fallback */ }
    }

    const calculatedCalories = Math.round(totalDistanceKm * userWeight * 1.036);

    let updatedLaps = laps.length === 0
      ? [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }]
      : laps;

    updatedLaps = updatedLaps.map(lap =>
      lap.isActive ? {
        ...lap,
        distanceMeters: lap.distanceMeters + distanceDeltaMeters,
        splitPace: smoothedPace,
      } : lap
    );

    if (settings.autoLapMode === 'distance' && settings.autoLapValue > 0) {
      const activeLap = updatedLaps.find(lap => lap.isActive);
      if (activeLap) {
        const thresholdMeters = settings.autoLapValue * 1000;
        if (activeLap.distanceMeters >= thresholdMeters) {
          get().triggerLap();
          return;
        }
      }
    }

    set({
      currentPace: smoothedPace,
      paceHistory: newHistory,
      laps: updatedLaps,
      totalCalories: calculatedCalories,
    });
  },
  
  // Initialize running data (called when workout starts)
  initializeRunningData: () => {
    set({
      laps: [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }],
      currentPace: 0,
      routeCoords: [],
      routeZones: [],
      activeRoutePath: [],
    });
  },

  // Clear running data
  clearRunningData: () => {
    const { stopGPSTracking } = get();
    stopGPSTracking();
    
    set({
      laps: [],
      currentPace: 0,
      paceHistory: [],
      routeCoords: [],
      routeZones: [],
      activeRoutePath: [],
      isSnapshotVisible: false,
      lastCompletedLap: null,
      lastPosition: null,
      totalCalories: 0,
      isMapFollowEnabled: true,
      currentWorkout: null,
      currentBlockIndex: 0,
      blockElapsedSeconds: 0,
      blockElapsedMeters: 0,
      blockSetNumber: 1,
      totalBlockSets: 1,
    });
  },

  // Finish workout - stop tracking, log analytics, award rewards, SAVE TO DB, and set status to finished
  finishWorkout: async () => {
    const { stopGPSTracking, totalCalories, routeCoords, activityType, currentPace } = get();
    
    // Stop all timers and GPS tracking
    stopGPSTracking();

    // Immediately wipe active_workouts doc (heatmap cleanup)
    if (typeof window !== 'undefined') {
      import('@/features/heatmap/services/active-workout.service').then(({ clearActiveWorkout }) => {
        import('@/lib/firebase').then(({ auth }) => {
          if (auth.currentUser?.uid) {
            clearActiveWorkout(auth.currentUser.uid).catch(() => {});
          }
        });
      }).catch(() => {});
    }
    
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
          await progressionState.awardWorkoutCoins(finalCalories).catch((error) => {
            console.error('[useRunningPlayer] Error awarding workout coins:', error);
          });
        }

        // Unified completion sync: dailyActivity + dailyProgress + streaks + session flag
        const durationMinutes = Math.max(Math.round(sessionState.totalDuration / 60), 1);
        const { syncWorkoutCompletion } = await import('@/features/workout-engine/services/completion-sync.service');
        const totalDistanceKm = sessionState.totalDistance ?? 0;
        await syncWorkoutCompletion({
          workoutType: 'running',
          durationMinutes,
          calories: finalCalories,
          activityCategory: 'cardio',
          displayIcon: 'run-fast',
          distanceKm: totalDistanceKm,
        }).catch((error) => {
          console.error('[useRunningPlayer] Error in syncWorkoutCompletion:', error);
        });
        
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

  setMapFollowEnabled: (v) => set({ isMapFollowEnabled: v }),

  // When devSim enables mock: kill any live real GPS watcher + mark status as simulated.
  // When devSim disables mock: clear the flag; next startGPSTracking call uses real GPS.
  setSimulationActive: (active: boolean) => {
    const { isSimulationActive: prev, gpsWatchId } = get();
    set({ isSimulationActive: active });
    if (active && !prev) {
      // Transitioning INTO simulation — silence any running real GPS watcher
      if (gpsWatchId !== null) {
        clearWatch(gpsWatchId);
        set({ gpsWatchId: null });
      }
      set({ gpsStatus: 'simulated', gpsAccuracy: 5 });
    }
  },

  // ── Planned Run Actions ────────────────────────────────────────────

  setCurrentWorkout: (workout) => {
    if (!workout) {
      get().resetPlannedRun();
      return;
    }
    set({
      currentWorkout: workout,
      currentBlockIndex: 0,
      blockElapsedSeconds: 0,
      blockElapsedMeters: 0,
      blockSetNumber: 1,
      totalBlockSets: 1,
    });
  },

  advanceBlock: () => {
    const { currentWorkout, currentBlockIndex } = get();
    if (!currentWorkout) return;

    const nextIndex = currentBlockIndex + 1;
    if (nextIndex >= currentWorkout.blocks.length) return;

    set({
      currentBlockIndex: nextIndex,
      blockElapsedSeconds: 0,
      blockElapsedMeters: 0,
    });
  },

  jumpToBlock: (targetIndex) => {
    const { currentWorkout } = get();
    if (!currentWorkout || targetIndex < 0 || targetIndex >= currentWorkout.blocks.length) return;
    set({
      currentBlockIndex: targetIndex,
      blockElapsedSeconds: 0,
      blockElapsedMeters: 0,
    });
  },

  tickBlockElapsed: () => {
    set((s) => ({ blockElapsedSeconds: s.blockElapsedSeconds + 1 }));
  },

  addBlockDistance: (meters) => {
    set((s) => ({ blockElapsedMeters: s.blockElapsedMeters + meters }));
  },

  resetPlannedRun: () => {
    set({
      currentWorkout: null,
      currentBlockIndex: 0,
      blockElapsedSeconds: 0,
      blockElapsedMeters: 0,
      blockSetNumber: 1,
      totalBlockSets: 1,
    });
  },
}));
