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
import { crossTrackDistanceMeters, type RouteTurn } from '@/features/parks/core/services/geoUtils';
import type { WorkoutHistoryEntry } from '../../../core/services/storage.service';

// ── Route-deviation tuning constants ─────────────────────────────────────────
// 40 m matches what consumer-grade GPS can reliably distinguish in urban
// canyons (typical accuracy is 5–15 m, worst-case 25–30 m). Tighter and we
// trip on noise; looser and we let the user wander an entire street width
// before we react. Calibrated against per-spec request.
const ROUTE_DEVIATION_THRESHOLD_M = 40;

// 3 consecutive samples ≈ 3 seconds at 1 Hz watchPosition. Hysteresis: we
// require sustained deviation, not a single spike. Drops false positives
// from urban GPS multipathing to near zero in field testing.
const ROUTE_DEVIATION_SAMPLE_THRESHOLD = 3;

export interface WorkoutSettings {
  autoLapMode: 'distance' | 'time' | 'off';
  autoLapValue: number;
  enableAudio: boolean;
  enableAutoPause: boolean;
  enableCountdown: boolean;
}

/**
 * The single goal a free-run session is targeting.
 *
 * Units are NORMALISED at write-time so every consumer (RouteStoryBar,
 * progress hooks, future telemetry) can do simple division without
 * worrying about minutes-vs-seconds or km-vs-meters mismatches:
 *
 *   - 'distance' → value in **kilometres** (matches `useSessionStore.totalDistance`)
 *   - 'time'     → value in **seconds**    (matches `useSessionStore.totalDuration`)
 *   - 'calories' → value in **kcal**       (matches `useRunningPlayer.totalCalories`)
 *
 * `null` = no goal set (e.g. a vanilla open-ended run). UI must treat
 * the absence as "hide the goal-progress bar" rather than "0% progress".
 */
export type SessionGoalType = 'distance' | 'time' | 'calories';
export interface SessionGoal {
  type: SessionGoalType;
  value: number;
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

  // ── Route Deviation (auto-rerouting) ─────────────────────────────────────
  // Live distance from the user's last GPS sample to the nearest point on
  // `activeRoutePath`, in metres. `null` when no comparable route is set.
  routeDeviationMeters: number | null;
  // How many consecutive samples have been over the threshold. Resets to 0
  // the moment a sample comes back inside the threshold.
  consecutiveOffRouteSamples: number;
  // True once `consecutiveOffRouteSamples` reaches the spec'd threshold (3).
  // Cleared by the orchestrator (useRouteDeviationOrchestrator) after it
  // swaps in a freshly recomputed route — at which point the user is on the
  // new path and the counter naturally restarts at 0.
  isOffRoute: boolean;
  // Monotonically incremented every time `isOffRoute` flips false→true.
  // The orchestrator's effect depends on this token so each new deviation
  // event triggers exactly one recalc, even if isOffRoute is cleared and
  // re-asserted in quick succession.
  offRouteEventToken: number;
  // True while the orchestrator's recalc is in flight. `checkRouteDeviation`
  // skips its work while this is set so we don't pile up redundant triggers.
  isRecalculatingRoute: boolean;

  // Guided Route Tracking
  // Holds the official_routes document id when the user is running a curated route.
  // Null when running a free-form / un-tagged session. Threaded into the saved
  // workout document and used to increment route analytics on completion.
  guidedRouteId: string | null;
  // Display metadata for the in-progress guided route. Populated alongside
  // guidedRouteId at workout-start so route-aware UI (GuidedRouteView /
  // GuidedRouteProgressStrip) can render route name + % progress without
  // re-reading the focusedRoute object from MapShell scope.
  guidedRouteName: string | null;
  guidedRouteDistanceKm: number | null;
  // Pre-computed turn list used by TurnCarousel. Set once at workout-start
  // and consumed as a static reference throughout the session.
  guidedRouteTurns: RouteTurn[] | null;
  
  // Map View State
  view: 'main' | 'laps';
  lastViewport: { latitude: number; longitude: number; zoom: number };
  
  // Snapshot State
  isSnapshotVisible: boolean;
  lastCompletedLap: Lap | null;

  // Elevation tracking
  /** Cumulative positive elevation gain in metres for this session. */
  elevationGain: number;
  /** Previous GPS altitude used to compute incremental gain. Null until first fix. */
  lastAltitude: number | null;

  /**
   * The exact workout document that was persisted to Firestore at the end of this
   * session. Set by finishWorkout after a successful save; null until then.
   * Summary screens read from this snapshot to guarantee what is displayed
   * matches what is in history — avoiding in-memory ghosts.
   */
  savedWorkoutSnapshot: WorkoutHistoryEntry | null;

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

  // ── Free-Run Session Goal ────────────────────────────────────────
  // Drives the single-segment story bar inside AdaptiveMetricsWrapper.
  // Set by FreeRunDrawer at workout start, read by useSessionGoalProgress.
  // See SessionGoal jsdoc for unit conventions.
  sessionGoal: SessionGoal | null;

  // Actions
  setRunMode: (mode: 'free' | 'plan' | 'my_routes') => void;
  setActivityType: (type: 'running' | 'walking') => void;
  setSuggestedRoutes: (routes: Route[]) => void;
  setActiveRoutePath: (path: number[][]) => void;
  // ── Route Deviation actions ──────────────────────────────────────────────
  /**
   * Compares the supplied position to `activeRoutePath` and updates the
   * deviation state machine. Designed to be called once per accepted GPS
   * sample (real or simulated) — the throttling that filters jittery
   * positions happens upstream in `startGPSTracking` / `injectSimPosition`.
   */
  checkRouteDeviation: (pos: { lat: number; lng: number }) => void;
  /** Orchestrator-only: bracket the recalc to prevent re-entry during swap. */
  setRecalculatingRoute: (v: boolean) => void;
  /**
   * Orchestrator-only: invoked after the new route has been swapped onto
   * the map. Resets the deviation counter & flag so detection restarts
   * cleanly against the new `activeRoutePath`.
   */
  clearOffRouteState: () => void;
  setGuidedRouteId: (id: string | null) => void;
  setGuidedRouteName: (name: string | null) => void;
  setGuidedRouteDistanceKm: (km: number | null) => void;
  setGuidedRouteTurns: (turns: RouteTurn[] | null) => void;
  setSessionGoal: (goal: SessionGoal | null) => void;
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
  routeDeviationMeters: null,
  consecutiveOffRouteSamples: 0,
  isOffRoute: false,
  offRouteEventToken: 0,
  isRecalculatingRoute: false,
  guidedRouteId: null,
  guidedRouteName: null,
  guidedRouteDistanceKm: null,
  guidedRouteTurns: null,
  view: 'main',
  lastViewport: { latitude: 32.0853, longitude: 34.7818, zoom: 15 },
  isSnapshotVisible: false,
  lastCompletedLap: null,
  paceHistory: [],
  isMapFollowEnabled: true,
  elevationGain: 0,
  lastAltitude: null,
  savedWorkoutSnapshot: null,
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

  // Free-Run Session Goal — null until FreeRunDrawer pushes one.
  sessionGoal: null,

  // Setters
  setRunMode: (mode) => set({ runMode: mode }),
  setActivityType: (type) => set({ activityType: type }),
  setSuggestedRoutes: (routes) => set({ suggestedRoutes: routes }),
  setActiveRoutePath: (path) => set({
    activeRoutePath: path,
    // Whenever the active route is swapped (workout start, deviation recalc,
    // mid-workout reroute), reset the deviation counter so the next sample
    // starts clean. The new path is, by construction, near the user.
    routeDeviationMeters: null,
    consecutiveOffRouteSamples: 0,
    isOffRoute: false,
  }),

  checkRouteDeviation: (pos) => {
    const {
      activeRoutePath,
      isRecalculatingRoute,
      consecutiveOffRouteSamples,
      isOffRoute,
      offRouteEventToken,
    } = get();

    // No comparable route → nothing to detect. Workout is in free-form mode
    // (no guided route) or activeRoutePath was cleared.
    if (!activeRoutePath || activeRoutePath.length < 2) return;

    // A recalc is in flight — its terminal `setActiveRoutePath` will reset
    // counters and we'd just be racing it. Skip cleanly.
    if (isRecalculatingRoute) return;

    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;

    const distMeters = crossTrackDistanceMeters(pos, activeRoutePath);
    if (!Number.isFinite(distMeters)) return;

    if (distMeters > ROUTE_DEVIATION_THRESHOLD_M) {
      const nextCount = consecutiveOffRouteSamples + 1;
      const justTripped =
        nextCount >= ROUTE_DEVIATION_SAMPLE_THRESHOLD && !isOffRoute;

      set({
        routeDeviationMeters: distMeters,
        consecutiveOffRouteSamples: nextCount,
        isOffRoute: isOffRoute || justTripped,
        // Bump token only on the false→true edge so the orchestrator's
        // useEffect fires exactly once per deviation event.
        offRouteEventToken: justTripped
          ? offRouteEventToken + 1
          : offRouteEventToken,
      });
    } else {
      // Within tolerance. Reset the counter & flag so a future deviation
      // starts a fresh 3-sample countdown rather than tripping immediately.
      if (consecutiveOffRouteSamples > 0 || isOffRoute) {
        set({
          routeDeviationMeters: distMeters,
          consecutiveOffRouteSamples: 0,
          isOffRoute: false,
        });
      } else {
        // Cheap path: just refresh the live distance for any UI bound to it.
        set({ routeDeviationMeters: distMeters });
      }
    }
  },

  setRecalculatingRoute: (v) => set({ isRecalculatingRoute: v }),

  clearOffRouteState: () => set({
    routeDeviationMeters: null,
    consecutiveOffRouteSamples: 0,
    isOffRoute: false,
  }),

  setGuidedRouteId: (id) => set({ guidedRouteId: id }),
  setGuidedRouteName: (name) => set({ guidedRouteName: name }),
  setGuidedRouteDistanceKm: (km) => set({ guidedRouteDistanceKm: km }),
  setGuidedRouteTurns: (turns) => set({ guidedRouteTurns: turns }),
  setSessionGoal: (goal) => set({ sessionGoal: goal }),
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

        // Reject NaN / Infinity / 0,0 samples BEFORE they touch any state.
        // The math helpers downstream (haversine, crossTrack, pace) all
        // produce NaN cascades when fed a bad coord, which then propagates
        // into routeCoords and breaks fitBounds in TurnCarousel/AppMap.
        // Dropping the sample early keeps `lastPosition` pointing at the
        // last KNOWN-GOOD fix — far better than NaN-poisoning the state.
        if (
          typeof lat !== 'number' || typeof lng !== 'number' ||
          !Number.isFinite(lat) || !Number.isFinite(lng) ||
          (lat === 0 && lng === 0)
        ) {
          console.warn('[useRunningPlayer] Dropping invalid GPS sample:', location);
          return;
        }

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

        // ── Elevation gain accumulation ────────────────────────────────
        // Only count ascents > 1 m between consecutive fixes to filter out
        // the ±2–5 m vertical noise typical of consumer GPS chips.
        const gpsAltitude = location.altitude;
        if (gpsAltitude != null) {
          const { lastAltitude } = get();
          if (lastAltitude !== null) {
            const delta = gpsAltitude - lastAltitude;
            if (delta > 1) {
              set((s) => ({ elevationGain: s.elevationGain + delta, lastAltitude: gpsAltitude }));
            } else {
              set({ lastAltitude: gpsAltitude });
            }
          } else {
            set({ lastAltitude: gpsAltitude });
          }
        }

        // Route-deviation pass — runs on EVERY accepted GPS sample, not only
        // ones that beat the 5m DISTANCE_THRESHOLD above (the threshold gates
        // distance/pace updates to avoid jitter, but a slow drift across the
        // 40m boundary is still a deviation worth flagging).
        get().checkRouteDeviation(currentPos);
      },
      (error) => {
        if (get().isSimulationActive) return; // ignore errors when sim took over
        // GeolocationPositionError codes:
        //   1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        // Whatever the code, we deliberately DO NOT touch `lastPosition`
        // or `routeCoords` here — the last-known-good fix is far more
        // useful to the UI (TurnCarousel can still center the map on it,
        // pace can still tick down, etc.) than wiping it to null and
        // forcing every consumer through a degraded "GPS searching" path.
        // We only flag the status pill so the user sees the chip is hunting.
        if (error.code === 3) {
          // Timeout is benign — fires every ~10s under bad sky cover. Quiet
          // log so dev console isn't flooded during a long-press signal hunt.
          console.warn('[useRunningPlayer] GPS timeout — keeping last known fix.');
        } else {
          console.error('[useRunningPlayer] GPS error:', error.code, error.message);
        }
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
      elevationGain: 0,
      lastAltitude: null,
      savedWorkoutSnapshot: null,
      // Reset deviation state at workout start so a previous session's
      // counters cannot leak into the new one and trigger a phantom recalc.
      routeDeviationMeters: null,
      consecutiveOffRouteSamples: 0,
      isOffRoute: false,
      isRecalculatingRoute: false,
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
      elevationGain: 0,
      lastAltitude: null,
      savedWorkoutSnapshot: null,
      // Same reset as initializeRunningData. We DON'T reset
      // `offRouteEventToken` here — it's a monotonically-increasing event
      // counter, and rewinding it could replay a stale orchestrator effect.
      routeDeviationMeters: null,
      consecutiveOffRouteSamples: 0,
      isOffRoute: false,
      isRecalculatingRoute: false,
      guidedRouteId: null,
      guidedRouteName: null,
      guidedRouteDistanceKm: null,
      guidedRouteTurns: null,
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
      // Reset the goal so the next session starts blank — the next
      // FreeRunDrawer.handleStartCta will push a fresh one.
      sessionGoal: null,
    });
  },

  // ── finishWorkout ─────────────────────────────────────────────────────────
  // SINGLE source-of-truth save. All data (laps, elevation, XP, park tag,
  // social feed post) is written here. FreeRunSummary and WorkoutSummaryPage
  // must NOT call saveWorkout() — they are display-only after this runs.
  finishWorkout: async () => {
    const { stopGPSTracking, totalCalories, routeCoords, activityType, currentPace, guidedRouteId, laps, elevationGain } = get();
    
    // Stop all timers and GPS tracking first
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
    
    if (typeof window !== 'undefined') {
      try {
        const { useSessionStore } = await import('@/features/workout-engine/core/store/useSessionStore');
        const { saveWorkout } = await import('@/features/workout-engine/core/services/storage.service');
        const { auth } = await import('@/lib/firebase');
        const sessionState = useSessionStore.getState();
        
        const finalCalories = totalCalories || 0;
        const currentUser = auth.currentUser;

        if (!currentUser) {
          console.error('❌ [useRunningPlayer] Cannot save workout: No User ID found');
        } else {
          // ── Sanitise numeric values ──────────────────────────────────
          const safeRoutePath = Array.isArray(routeCoords) && routeCoords.length > 0
            ? routeCoords.map(coord => [coord[0], coord[1]] as [number, number])
            : [];
          const safeDistance = Number.isFinite(sessionState.totalDistance) ? sessionState.totalDistance : 0;
          const safeDuration = Number.isFinite(sessionState.totalDuration) ? sessionState.totalDuration : 0;
          const safeCalories = Number.isFinite(finalCalories) ? finalCalories : 0;
          const safePace = Number.isFinite(currentPace) ? currentPace : 0;
          const safeElevation = Number.isFinite(elevationGain) && elevationGain > 0 ? Math.round(elevationGain) : undefined;
          const durationMinutes = Math.max(Math.round(safeDuration / 60), 1);

          // ── XP calculation (must happen BEFORE save so xpEarned is on doc) ──
          const { useProgressionStore } = await import('@/features/user/progression/store/useProgressionStore');
          const { calculateRunningWorkoutXP } = await import('@/features/user/progression/services/xp.service');
          const progressionState = useProgressionStore.getState();
          const sessionXP = calculateRunningWorkoutXP({
            durationMinutes,
            distanceKm: safeDistance,
            streak: progressionState.currentStreak,
            activityType: (activityType as 'running' | 'walking') ?? 'running',
          });

          // ── Coins (respect feature flag) ──────────────────────────────
          const { IS_COIN_SYSTEM_ENABLED } = await import('@/config/feature-flags');
          const earnedCoins = IS_COIN_SYSTEM_ENABLED ? Math.floor(safeCalories) : 0;

          // ── Completed laps (strip the still-active lap if present) ────
          const completedLaps = laps.filter(l => !l.isActive && l.distanceMeters > 0);

          // ── Park detection (before save so parkId lands on the doc) ──
          const lastCoord = safeRoutePath.length > 0 ? safeRoutePath[safeRoutePath.length - 1] : null;
          let detectedPark: { parkId: string; parkName: string; authorityId?: string } | null = null;
          if (lastCoord) {
            try {
              const { detectNearbyPark } = await import('@/features/workout-engine/services/park-detection.service');
              detectedPark = await detectNearbyPark(lastCoord[1], lastCoord[0]);
            } catch { /* non-fatal */ }
          }

          // ── Build the single authoritative workout document ───────────
          const workoutPayload = {
            userId: currentUser.uid,
            activityType: activityType || 'running',
            workoutType: 'running' as const,
            distance: safeDistance,
            duration: safeDuration,
            calories: safeCalories,
            pace: safePace,
            routePath: safeRoutePath,
            earnedCoins,
            xpEarned: sessionXP,
            ...(completedLaps.length > 0 ? { laps: completedLaps } : {}),
            ...(safeElevation !== undefined ? { elevationGain: safeElevation } : {}),
            ...(guidedRouteId ? { routeId: guidedRouteId } : {}),
            ...(detectedPark ? { parkId: detectedPark.parkId, parkName: detectedPark.parkName } : {}),
          };

          console.log('🚀 [useRunningPlayer] Saving workout (single write)...', {
            distance: safeDistance, duration: safeDuration, laps: completedLaps.length,
            elevation: safeElevation, xp: sessionXP, park: detectedPark?.parkName ?? 'none',
          });

          let workoutSaved = false;
          try {
            const success = await saveWorkout(workoutPayload);
            if (success) {
              workoutSaved = true;
              // Store the confirmed snapshot so summary screens show exactly
              // what was written, not in-memory approximations.
              set({ savedWorkoutSnapshot: { ...workoutPayload, date: new Date() } });
              console.log('✅ [useRunningPlayer] Workout saved successfully');
            } else {
              console.error('❌ [useRunningPlayer] saveWorkout returned false');
            }
          } catch (saveError) {
            console.error('❌ [useRunningPlayer] Save error:', saveError);
          }

          // ── Post-save side-effects (all best-effort) ──────────────────

          // Guided route analytics
          if (workoutSaved && guidedRouteId) {
            import('@/lib/firebase').then(async ({ db }) => {
              const { doc, updateDoc, increment, serverTimestamp } = await import('firebase/firestore');
              updateDoc(doc(db, 'official_routes', guidedRouteId), {
                'analytics.usageCount': increment(1),
                'analytics.lastUsed': serverTimestamp(),
              }).catch(() => {});
            }).catch(() => {});
          }

          // Park sessions check-in
          if (workoutSaved && detectedPark?.parkId) {
            import('@/lib/firebase').then(async ({ auth: fbAuth, db }) => {
              const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
              const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
              const authorityId = useUserStore.getState().profile?.core?.authorityId ?? detectedPark!.authorityId ?? null;
              if (fbAuth.currentUser && authorityId) {
                addDoc(collection(db, 'sessions'), {
                  authorityId,
                  parkId: detectedPark!.parkId,
                  userId: fbAuth.currentUser.uid,
                  date: serverTimestamp(),
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          // Social feed post
          if (workoutSaved) {
            import('@/features/social/services/feed.service').then(async ({ createWorkoutPost }) => {
              const { extractFeedScope } = await import('@/features/social/services/feed-scope.utils');
              const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
              const userProfile = useUserStore.getState().profile;
              if (userProfile?.core?.name) {
                createWorkoutPost({
                  authorUid: currentUser.uid,
                  authorName: userProfile.core.name,
                  activityCategory: 'cardio',
                  durationMinutes,
                  distanceKm: safeDistance > 0 ? safeDistance : undefined,
                  paceMinPerKm: safePace > 0 ? safePace : undefined,
                  ...extractFeedScope(userProfile),
                  parkId: detectedPark?.parkId,
                  parkName: detectedPark?.parkName,
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          // Award XP via Guardian (authoritative server write)
          progressionState.awardRunningXP({
            durationMinutes,
            distanceKm: safeDistance,
            streak: progressionState.currentStreak,
            activityType: (activityType as 'running' | 'walking') ?? 'running',
          }).catch((e) => console.warn('[useRunningPlayer] awardRunningXP failed:', e));

          // Coins
          if (safeCalories > 0) {
            progressionState.awardWorkoutCoins(safeCalories).catch((e) =>
              console.error('[useRunningPlayer] awardWorkoutCoins error:', e)
            );
          }
        }

        // Analytics event
        import('@/features/analytics/AnalyticsService').then(async ({ Analytics }) => {
          const { useSessionStore: SS } = await import('@/features/workout-engine/core/store/useSessionStore');
          const s = SS.getState();
          Analytics.logWorkoutComplete(`free-run-${Date.now()}`, s.totalDuration, totalCalories, totalCalories).catch(() => {});
        }).catch(() => {});

        // Unified completion sync
        const durationMinutes = Math.max(Math.round(sessionState.totalDuration / 60), 1);
        const { syncWorkoutCompletion } = await import('@/features/workout-engine/services/completion-sync.service');
        await syncWorkoutCompletion({
          workoutType: 'running',
          durationMinutes,
          calories: finalCalories,
          activityCategory: 'cardio',
          displayIcon: 'run-fast',
          distanceKm: sessionState.totalDistance ?? 0,
        }).catch((e) => console.error('[useRunningPlayer] syncWorkoutCompletion error:', e));

        // Transition status → finished (triggers FreeRunSummary to mount)
        sessionState.endSession();

      } catch (error) {
        console.error('[useRunningPlayer] Error finishing workout:', error);
        if (typeof window !== 'undefined') {
          const { useSessionStore } = await import('@/features/workout-engine/core/store/useSessionStore');
          useSessionStore.getState().endSession();
        }
      } finally {
        set({ guidedRouteId: null, guidedRouteName: null, guidedRouteDistanceKm: null, guidedRouteTurns: null });
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
