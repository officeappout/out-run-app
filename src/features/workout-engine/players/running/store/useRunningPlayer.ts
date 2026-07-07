/**
 * Running Player Store
 * Manages running-specific state (laps, GPS, pace)
 * Works alongside useSessionStore for universal metrics
 */
import { create } from 'zustand';
import { Route } from '@/features/parks';
import { Lap, GeoPoint } from '../../../core/types/session.types';
import { calculateDistance } from '@/lib/services/location.service';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import type RunWorkout from '../types/run-workout.type';
import { crossTrackDistanceMeters, type RouteTurn } from '@/features/parks/core/services/geoUtils';
import type { WorkoutHistoryEntry } from '../../../core/services/storage.service';
import { rdpSimplify, truncatePrecision } from '@/utils/pathSimplify';
// Direct sibling import — both stores live under workout-engine/* with no
// circular concern (core never imports from players). Using a static import
// instead of the previous `require()`-inside-try/catch eliminates the silent
// failure path that left totalDistance stuck at 0 when bundler cache hiccuped.
import { useSessionStore } from '../../../core/store/useSessionStore';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { IS_COMMUNITY_FEED_ENABLED } from '@/config/feature-flags';

// ── Module-level coordinate buffers ──────────────────────────────────────────
// Accumulate GPS samples in a flat buffer and flush to Zustand every
// FLUSH_EVERY points. This replaces the per-sample [...state.routeCoords, coord]
// spread that caused O(n²) allocations on long runs.
let _coordBuffer: number[][] = [];
let _zoneBuffer: (string | null)[] = [];
const FLUSH_EVERY = 10;

// Cleanup handle for the useGPSStore subscription opened by startGPSTracking.
// Stored at module level (not Zustand state) so stopGPSTracking can reach it
// without a state read, matching the pattern used for _coordBuffer above.
let _gpsStoreUnsub: (() => void) | null = null;

// ── Poor-GPS hysteresis ───────────────────────────────────────────────────────
// Counts consecutive poor-accuracy samples since the last good fix.
// Skips accumulation only while count < POOR_RESUME_AFTER (spike guard).
// Once N poor samples arrive, the user is in a genuinely coarse-GPS zone and
// we fall through to normal accumulation — JUMP + SPEED guards catch outliers.
let _consecutivePoorCount = 0;
// Timestamp of the most-recent successful distance accumulation.
// Safety net: if position keeps updating but distance hasn't advanced for
// MAX_DISTANCE_FREEZE_MS, force-resume accumulation on the next sample.
let _lastDistanceUpdateMs = 0;
// Count of fixes with accuracy ≤ WARMUP_MAX_ACCURACY_M since tracking started.
// Gates distance accumulation until GPS has a stable lock.
let _goodFixCount = 0;
// Buffer of positions rejected by the JUMP or SPEED guard, used by the re-anchor
// escape hatch. Reset on every successful accumulation or tracking restart.
let _rejectBuffer: Array<{ lat: number; lng: number; ts: number }> = [];

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

/**
 * The intent of the current running session.
 *
 *   'workout'  → traditional Free-Run loop session (default behaviour).
 *                Awards running XP, full StatsCarousel HUD, full
 *                celebratory summary.
 *
 *   'commute'  → A-to-B commute. Awards commute XP at a slimmer rate
 *                (no distance bonus), HUD swaps to ETA-focused
 *                CommuteStatsCarousel, summary collapses to a slim
 *                "arrival confirmation" variant.
 *
 * Named `RunSessionIntent` (rather than the more obvious
 * `SessionMode`) because the workout-engine core already exports a
 * `SessionMode` union of activity types (running | walking | strength
 * | hybrid | idle). Two different meanings for the same name across
 * the engine would be a constant source of import confusion.
 *
 * Set by `setCommuteContext(ctx)` BEFORE `startActiveWorkout()` so the
 * pre-flight chain (clearRunningData → initializeRunningData) does not
 * race with the intent. Cleared by `finishWorkout` after the commute
 * session is persisted.
 */
export type RunSessionIntent = 'workout' | 'commute';

export interface CommuteContext {
  destination: { lat: number; lng: number };
  /** Optional human-readable label shown on the destination chip / summary. */
  label?: string;
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
  /** Firestore document ID of the last saved workout. Used for delete/undo. */
  savedWorkoutId: string | null;

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
  // Set to true the first time a good/perfect fix arrives; reset on stopGPSTracking.
  // Gates distance accumulation for poor-accuracy samples (avoids phantom distance
  // while still allowing warm-up phase to measure before first good lock).
  hasHadGoodFix: boolean;
  /** Last GPS filter decision — populated on every sample; read by GpsDebugHud (?debug=gps). */
  lastFilterAction: string | null;
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

  // ── Commute Mode (A-to-B navigation) ─────────────────────────────
  // sessionMode is the SINGLE switch that all commute-vs-workout UI
  // and reward branching reads from. It is intentionally separate from
  // `runMode` (free | plan | my_routes), which describes WHICH route
  // template a workout uses, while sessionMode describes WHY the user
  // is moving (workout vs daily-life navigation).
  //
  // commuteContext carries the destination metadata (coordinates +
  // label) so the post-workout summary and the commute HUD can
  // reference where the user was heading without re-querying any
  // cross-store state.
  //
  // Both are preserved across clearRunningData on purpose — they
  // represent the ABOUT-TO-START session's intent, set BEFORE
  // startActiveWorkout reaches the clear/initialise pre-flight. They
  // are reset by `finishWorkout` (after persistence) and by
  // `clearCommuteContext()` for the explicit user-cancel path.
  sessionMode: RunSessionIntent;
  commuteContext: CommuteContext | null;

  // True only when the user explicitly started a GROUP run (via lobby, invite
  // accept, or RunShareBar fresh-group path). False for all solo runs.
  // Prevents stale useSharedSession.groupId (set by CommunitySessionBanner)
  // from being tagged onto a solo workout in finishWorkout().
  isGroupRun: boolean;

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
  /**
   * Stage a commute session. Sets sessionMode → 'commute' AND stashes
   * the destination context. Must be called BEFORE startActiveWorkout
   * so the upcoming session is born commute-flavoured.
   */
  setCommuteContext: (ctx: CommuteContext) => void;
  /**
   * Drop the commute intent (e.g. user cancels before starting, or
   * after the commute summary is dismissed). Resets sessionMode →
   * 'workout' and nulls the destination context.
   */
  clearCommuteContext: () => void;
  setIsGroupRun: (v: boolean) => void;
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
  deleteLastWorkout: () => Promise<boolean>;

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
  savedWorkoutId: null,
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
  hasHadGoodFix: false,
  lastFilterAction: null,
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

  // Commute mode — defaults to 'workout' so existing flows are untouched.
  sessionMode: 'workout',
  commuteContext: null,
  isGroupRun: false,

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

  setCommuteContext: (ctx) =>
    set({
      sessionMode: 'commute',
      commuteContext: {
        destination: { lat: ctx.destination.lat, lng: ctx.destination.lng },
        label: ctx.label,
      },
    }),

  clearCommuteContext: () =>
    set({
      sessionMode: 'workout',
      commuteContext: null,
    }),

  setIsGroupRun: (v) => set({ isGroupRun: v }),

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
    // SINGLE source of truth for "one second has elapsed". Drives BOTH:
    //   • laps[active].durationSeconds  (consumed by LapMetrics)
    //   • useSessionStore.totalDuration (consumed by MainMetrics)
    // Previously these were ticked by two independent timers, which is how
    // the time field could freeze on one slide while the other ticked. The
    // session store self-gates on status==='active' so paused sessions stop
    // accumulating totalDuration cleanly. (Lap-side gating is a separate
    // concern handled at pause/resume; not addressed by this commit.)
    const durationInterval = setInterval(() => {
      const { laps, settings } = get();
      const activeLap = laps.find(l => l.isActive);
      if (!activeLap) return;

      // Tick the universal session timer FIRST so MainMetrics' totalDuration
      // and the lap-side counter advance on the same frame. tick() is a
      // no-op while status !== 'active', so this is pause-safe.
      useSessionStore.getState().tick();

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

    // ── Real GPS mode — single pipeline via useGPSStore ────────────────
    // useGPSStore.coords is driven exclusively by useGPS.ts, which uses
    // @capacitor/geolocation (CLLocationManager) on native and
    // navigator.geolocation on web — the only path that works correctly
    // on iOS Capacitor. Subscribing here instead of opening a second
    // navigator.geolocation watcher eliminates the dual-pipeline split
    // that caused distance to stay at 0 on native builds.
    set({ gpsStatus: 'searching', gpsAccuracy: null });

    let lastPos: { lat: number; lng: number } | null = null;
    let lastTimestamp: number | null = null;
    // Movement gate: 5 m suppresses urban GPS jitter while still responding
    // to slow walking. Satellite jumps > MAX_JUMP_M are discarded entirely.
    const DISTANCE_THRESHOLD = 5;
    const MAX_JUMP_M = 80; // tightened from 200 m — urban canyon multipath stays < 80 m
    const WARMUP_MIN_GOOD_FIXES = 2;   // fixes required before accumulation starts
    const WARMUP_MAX_ACCURACY_M = 30;  // accuracy threshold for warm-up counting
    // MIN_SPEED_MS / MAX_PACE_MIN_KM widened so a slow walk (≈1 m/s) still
    // produces a non-zero pace.
    const MIN_SPEED_MS = 0.3;
    const MAX_PACE_MIN_KM = 30;
    // Upper bound on realistic running speed (~43 km/h). Catches poor-accuracy
    // jumps that slipped past the 200 m gate without inflating distance.
    const MAX_REALISTIC_SPEED_MS = 12;
    // Re-anchor escape hatch: breaks the "frozen anchor" stall that occurs when
    // the user genuinely moves > MAX_JUMP_M and stays there (all fixes rejected).
    const REANCHOR_WINDOW = 5;           // consecutive rejected samples required
    const REANCHOR_CLUSTER_RADIUS = 20;  // metres — max spread within the cluster
    const REANCHOR_MIN_TIME_MS = 10_000; // ms — cluster must persist at least this long

    _gpsStoreUnsub = useGPSStore.subscribe((state, prevState) => {
      if (state.coords === prevState.coords) return; // no new fix
      const coords = state.coords;
      if (!coords) return;

      if (get().isSimulationActive) return;

      const { lat, lng } = coords;

      // Reject NaN / Infinity / 0,0 samples — same guard as before, but
      // now applied at the subscription layer instead of in the watcher cb.
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        console.warn('[useRunningPlayer] Dropping invalid GPS sample:', coords);
        return;
      }

      // Phase 2 — accuracy gate: process every fix; mark quality instead of
      // discarding. The previous location.service watcher rejected fixes with
      // accuracy > 50 m, causing the first 30–90 s to produce zero distance.
      // Now all fixes pass through; poor ones are labelled 'poor' and the
      // speed sanity check below guards against inflation.
      const accuracy = coords.accuracy ?? 999;
      let gpsStatus: 'searching' | 'poor' | 'good' | 'perfect' | 'simulated';
      if (accuracy <= 10) gpsStatus = 'perfect';
      else if (accuracy <= 50) gpsStatus = 'good';   // raised from 30m — browser GPS is typically 30–60m
      else gpsStatus = 'poor';

      const wasGoodBefore = get().hasHadGoodFix;
      const isGoodNow = gpsStatus === 'good' || gpsStatus === 'perfect';
      set({
        gpsAccuracy: accuracy < 999 ? accuracy : null,
        gpsStatus,
        ...(isGoodNow && !wasGoodBefore ? { hasHadGoodFix: true } : {}),
      });
      if (accuracy <= WARMUP_MAX_ACCURACY_M) {
        _goodFixCount++;
      }

      if (process.env.NODE_ENV !== 'production') {
        const totalDist = useSessionStore.getState().totalDistance;
        console.log(
          `[GPS 📍] acc=${Math.round(accuracy)}m status=${gpsStatus} hasHadGoodFix=${wasGoodBefore} | total=${totalDist.toFixed(3)}km`
        );
      }

      // ── Poor-GPS hysteresis ─────────────────────────────────────────────────
      // A single poor sample after a good fix is treated as a spike and skipped.
      // But N consecutive poor samples mean the user is in a coarse-GPS zone and
      // is genuinely moving — resume accumulation so distance never freezes.
      // The downstream JUMP (200 m) and SPEED (12 m/s) guards catch actual outliers.
      //
      // Separately, if the position keeps updating but no distance has been
      // accumulated for MAX_DISTANCE_FREEZE_MS, force-resume regardless of count —
      // a safety net against any future edge case that keeps _consecutivePoorCount
      // below the threshold while the user is walking.
      //
      // When we DO skip (spike case): do NOT advance lastPos so the anchor stays
      // pinned to the last good fix. lastPosition (store/UI) still updates so the
      // map marker moves correctly.
      const POOR_RESUME_AFTER = 3;           // skip max 2 poor spikes; resume on the 3rd
      const MAX_DISTANCE_FREEZE_MS = 10_000; // force resume if distance frozen > 10 s

      if (gpsStatus === 'poor' && wasGoodBefore) {
        _consecutivePoorCount++;
        const frozenTooLong =
          _lastDistanceUpdateMs > 0 &&
          Date.now() - _lastDistanceUpdateMs > MAX_DISTANCE_FREEZE_MS;

        if (_consecutivePoorCount < POOR_RESUME_AFTER && !frozenTooLong) {
          // Single spike — skip
          if (process.env.NODE_ENV !== 'production') {
            console.log(
              `[GPS ⚠️] SKIP spike poor ${Math.round(accuracy)}m (${_consecutivePoorCount}/${POOR_RESUME_AFTER})`
            );
          }
          set({
            lastPosition: { lat, lng },
            lastFilterAction: `⚠️ SKIP poor ${Math.round(accuracy)}m (${_consecutivePoorCount}/${POOR_RESUME_AFTER})`,
          });
          return;
        }

        // N+ consecutive poor samples or frozen > 10 s → fall through to accumulation
        if (process.env.NODE_ENV !== 'production') {
          const reason = frozenTooLong ? 'timeout' : `${_consecutivePoorCount}× poor`;
          console.log(`[GPS ⚠️→✅] poor resume (${reason}) acc=${Math.round(accuracy)}m`);
        }
      } else if (isGoodNow) {
        // Good/perfect fix resets the consecutive-poor counter
        _consecutivePoorCount = 0;
      }

      const currentPos = { lat, lng };

      // ── Warm-up gate ──────────────────────────────────────────────────────
      // Don't accumulate distance or route coords until GPS has a stable lock
      // (≥ WARMUP_MIN_GOOD_FIXES fixes at accuracy ≤ WARMUP_MAX_ACCURACY_M).
      // Position and timestamp update immediately so the map marker is live.
      if (_goodFixCount < WARMUP_MIN_GOOD_FIXES) {
        lastPos = currentPos;
        lastTimestamp = Date.now();
        set({ lastPosition: currentPos, lastFilterAction: `⏳ warm-up (${_goodFixCount}/${WARMUP_MIN_GOOD_FIXES})` });
        return;
      }

      // ── Re-anchor cluster check ───────────────────────────────────────────
      // Called after every JUMP or SPEED reject. Returns the cluster centroid
      // when REANCHOR_WINDOW consecutive rejected samples lie within
      // REANCHOR_CLUSTER_RADIUS of each other for ≥ REANCHOR_MIN_TIME_MS,
      // signalling genuine movement rather than a satellite artefact.
      const checkReanchorCluster = (): { lat: number; lng: number } | null => {
        if (_rejectBuffer.length < REANCHOR_WINDOW) return null;
        const win = _rejectBuffer.slice(-REANCHOR_WINDOW);
        if (win[win.length - 1].ts - win[0].ts < REANCHOR_MIN_TIME_MS) return null;
        const centLat = win.reduce((s, p) => s + p.lat, 0) / REANCHOR_WINDOW;
        const centLng = win.reduce((s, p) => s + p.lng, 0) / REANCHOR_WINDOW;
        for (const p of win) {
          if (calculateDistance(p.lat, p.lng, centLat, centLng) > REANCHOR_CLUSTER_RADIUS) return null;
        }
        return { lat: centLat, lng: centLng };
      };

      if (lastPos) {
        const distanceDelta = calculateDistance(lastPos.lat, lastPos.lng, lat, lng);

        // Discard satellite jump artefacts — a single sample > 200 m from the
        // last known-good position is almost always a GPS cold-start glitch or
        // multipath canyon spike, not real movement.
        if (distanceDelta > MAX_JUMP_M) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[GPS ⛔] JUMP rejected: ${Math.round(distanceDelta)}m (>${MAX_JUMP_M}m)`);
          }
          // Push to reject buffer and check if the escape hatch triggers.
          _rejectBuffer.push({ lat: currentPos.lat, lng: currentPos.lng, ts: Date.now() });
          const reanchor = checkReanchorCluster();
          if (reanchor) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `[GPS ⚓] REANCHOR: ${REANCHOR_WINDOW} JUMP rejects clustered within ${REANCHOR_CLUSTER_RADIUS}m → new anchor (${reanchor.lat.toFixed(5)}, ${reanchor.lng.toFixed(5)})`
              );
            }
            lastPos = reanchor;
            lastTimestamp = Date.now();
            _rejectBuffer = [];
            set({ lastPosition: reanchor, lastFilterAction: `⚓ REANCHOR (${REANCHOR_WINDOW}× cluster)` });
            return;
          }
          // Do NOT update lastPos — anchor stays on the last good fix to break
          // the domino effect (next sample would otherwise measure from the jumped pos).
          set({ lastPosition: currentPos, lastFilterAction: `⛔ JUMP ${Math.round(distanceDelta)}m` });
          return;
        }

        if (process.env.NODE_ENV !== 'production' && distanceDelta <= DISTANCE_THRESHOLD) {
          const totalDist = useSessionStore.getState().totalDistance;
          console.log(
            `[GPS 🔇] below threshold: delta=${Math.round(distanceDelta)}m (<${DISTANCE_THRESHOLD}m) | total=${totalDist.toFixed(3)}km`
          );
        }

        if (distanceDelta > DISTANCE_THRESHOLD) {
          const now = Date.now();
          const timeDeltaSeconds = lastTimestamp ? (now - lastTimestamp) / 1000 : 0;

          // Speed sanity: poor-accuracy fixes can produce plausible-looking
          // distances that are still physically impossible. Reject if the
          // implied speed exceeds MAX_REALISTIC_SPEED_MS — accept the position
          // update (lastPos / lastPosition) but discard the km contribution.
          if (timeDeltaSeconds > 0 && distanceDelta / timeDeltaSeconds > MAX_REALISTIC_SPEED_MS) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `[GPS ⛔] SPEED rejected: ${Math.round(distanceDelta / timeDeltaSeconds)}m/s (>${MAX_REALISTIC_SPEED_MS}m/s) delta=${Math.round(distanceDelta)}m dt=${timeDeltaSeconds.toFixed(1)}s`
              );
            }
            // Push to reject buffer and check if the escape hatch triggers.
            _rejectBuffer.push({ lat: currentPos.lat, lng: currentPos.lng, ts: Date.now() });
            const reanchor = checkReanchorCluster();
            if (reanchor) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(
                  `[GPS ⚓] REANCHOR: ${REANCHOR_WINDOW} SPEED rejects clustered within ${REANCHOR_CLUSTER_RADIUS}m → new anchor (${reanchor.lat.toFixed(5)}, ${reanchor.lng.toFixed(5)})`
                );
              }
              lastPos = reanchor;
              lastTimestamp = Date.now();
              _rejectBuffer = [];
              set({ lastPosition: reanchor, lastFilterAction: `⚓ REANCHOR (${REANCHOR_WINDOW}× cluster)` });
              return;
            }
            // Do NOT update lastPos — anchor stays on the last good fix.
            set({ lastPosition: currentPos, lastFilterAction: `⛔ SPEED ${Math.round(distanceDelta / timeDeltaSeconds)}m/s` });
            lastTimestamp = now;
            return;
          }

          if (process.env.NODE_ENV !== 'production') {
            const totalDistBefore = useSessionStore.getState().totalDistance;
            console.log(
              `[GPS ✅] ACCUMULATE: delta=${Math.round(distanceDelta)}m | total ${totalDistBefore.toFixed(3)} → ${(totalDistBefore + distanceDelta / 1000).toFixed(3)}km`
            );
          }
          _lastDistanceUpdateMs = Date.now();
          _rejectBuffer = []; // Good accumulation — consecutive reject streak broken
          set({ lastFilterAction: `✅ +${Math.round(distanceDelta)}m` });

          if (accuracy <= 40) {
            get().addCoord([lng, lat]);
          }
          get().addBlockDistance(distanceDelta);
          useSessionStore.getState().updateDistance(distanceDelta / 1000);

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
        } else {
          _rejectBuffer = []; // Non-rejected sample — consecutive reject streak broken
          set({ lastFilterAction: `🔇 <${DISTANCE_THRESHOLD}m (${Math.round(distanceDelta)}m)` });
        }
      } else {
        if (accuracy <= 40) {
          get().addCoord([lng, lat]);
        }
        lastTimestamp = Date.now();
      }

      lastPos = currentPos;
      set({ lastPosition: currentPos });

      // ── Elevation gain accumulation ────────────────────────────────
      // altitude is carried through useGPS.ts → useGPSStore.coords.altitude.
      // Only count ascents > 1 m to filter the ±2–5 m vertical noise typical
      // of consumer GPS chips.
      const gpsAltitude = coords.altitude ?? null;
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
    });

    set({ gpsWatchId: null, durationIntervalId: durationInterval });
  },

  // Stop GPS tracking
  stopGPSTracking: () => {
    const { gpsWatchId, durationIntervalId, releaseWakeLock } = get();
    
    // Cancel the useGPSStore subscription opened by startGPSTracking.
    _gpsStoreUnsub?.();
    _gpsStoreUnsub = null;
    _consecutivePoorCount = 0;
    _lastDistanceUpdateMs = 0;
    _goodFixCount = 0;
    _rejectBuffer = [];

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
      hasHadGoodFix: false,
    });
  },
  
  // Add GPS coordinate — buffered for O(1) amortised cost.
  // Pushes into module-level buffers and flushes to Zustand every FLUSH_EVERY
  // samples, replacing the previous [...state.routeCoords, coord] spread that
  // allocated a new array on every GPS tick (O(n²) over a long run).
  addCoord: (coord) => {
    const { currentWorkout, currentBlockIndex } = get();
    const zoneType = currentWorkout?.blocks?.[currentBlockIndex]?.zoneType ?? null;
    _coordBuffer.push(coord);
    _zoneBuffer.push(zoneType);
    if (_coordBuffer.length >= FLUSH_EVERY) {
      const flushedCoords = _coordBuffer.splice(0);
      const flushedZones  = _zoneBuffer.splice(0);
      set((state) => ({
        routeCoords: [...state.routeCoords, ...flushedCoords],
        routeZones:  [...state.routeZones,  ...flushedZones],
      }));
    }
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

    // Direct read — same rationale as the GPS callback fix. The static
    // import at the top of this file guarantees the store is reachable;
    // the previous try/catch could mask bundler races and yield 0 calories.
    const totalDistanceKm = useSessionStore.getState().totalDistance || 0;

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
    const seedLap = {
      id: '1',
      lapNumber: 1,
      distanceMeters: 0,
      durationSeconds: 0,
      splitPace: 0,
      isActive: true,
    };
    // ── DEBUG: prove the first lap object is being seeded into the store
    // at workout-start. If the user reports "slide 2 is empty during a
    // workout", the absence of this log indicates `_doStartActiveWorkout`
    // never ran — meaning the active-workout chrome rendered, but the
    // session never actually transitioned to 'active'. Remove with the
    // rest of the temporary debug instrumentation.
    // eslint-disable-next-line no-console
    console.log('[useRunningPlayer.initializeRunningData] seeding first lap', seedLap);
    _coordBuffer = [];
    _zoneBuffer  = [];
    _consecutivePoorCount = 0;
    _lastDistanceUpdateMs = 0;
    _goodFixCount = 0;
    _rejectBuffer = [];
    set({
      laps: [seedLap],
      currentPace: 0,
      routeCoords: [],
      routeZones: [],
      activeRoutePath: [],
      elevationGain: 0,
      lastAltitude: null,
      savedWorkoutSnapshot: null,
  savedWorkoutId: null,
      // Reset deviation state at workout start so a previous session's
      // counters cannot leak into the new one and trigger a phantom recalc.
      routeDeviationMeters: null,
      consecutiveOffRouteSamples: 0,
      isOffRoute: false,
      isRecalculatingRoute: false,
      lastFilterAction: null,
    });
  },

  // Clear running data
  clearRunningData: () => {
    const { stopGPSTracking } = get();
    stopGPSTracking();
    _coordBuffer = [];
    _zoneBuffer  = [];
    // Clear shared session state so no stale groupId persists into the
    // next solo run (CommunitySessionBanner can re-set it if a group
    // session is genuinely ongoing — that is correct behaviour).
    useSharedSession.getState().clearGroupSession();
    _consecutivePoorCount = 0;
    _lastDistanceUpdateMs = 0;
    _goodFixCount = 0;
    _rejectBuffer = [];
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
  savedWorkoutId: null,
      isGroupRun: false,
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
      lastFilterAction: null,
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
    // Flush any GPS samples that accumulated in the buffer since the last
    // FLUSH_EVERY threshold — guarantees the final segment is not lost.
    if (_coordBuffer.length > 0) {
      const flushedCoords = _coordBuffer.splice(0);
      const flushedZones  = _zoneBuffer.splice(0);
      set((state) => ({
        routeCoords: [...state.routeCoords, ...flushedCoords],
        routeZones:  [...state.routeZones,  ...flushedZones],
      }));
    }

    const { stopGPSTracking, totalCalories, routeCoords, activityType, currentPace, guidedRouteId, laps, elevationGain, sessionMode, commuteContext } = get();
    const isCommute = sessionMode === 'commute';
    
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
          // Always transition to finished so the summary screen shows even without a save.
          sessionState.endSession();
        } else {
          // ── Sanitise + compress route path ───────────────────────────
          // RDP simplification cuts a typical 2 000-point run to ~150–200
          // points (>90 % reduction). truncatePrecision clips to 6 decimal
          // places (~0.1 m) — removing the extra 9 digits that raw IEEE 754
          // GPS output carries but Firestore pays to store.
          const rawRoutePath = Array.isArray(routeCoords) && routeCoords.length > 0
            ? routeCoords.map(coord => [coord[0], coord[1]] as [number, number])
            : [];
          const safeRoutePath = rawRoutePath.length >= 2
            ? truncatePrecision(rdpSimplify(rawRoutePath))
            : rawRoutePath;
          const safeDistance = Number.isFinite(sessionState.totalDistance) ? sessionState.totalDistance : 0;
          const safeDuration = Number.isFinite(sessionState.totalDuration) ? sessionState.totalDuration : 0;
          const safeCalories = Number.isFinite(finalCalories) ? finalCalories : 0;
          const safePace = Number.isFinite(currentPace) ? currentPace : 0;
          const safeElevation = Number.isFinite(elevationGain) && elevationGain > 0 ? Math.round(elevationGain) : undefined;
          const durationMinutes = Math.max(Math.round(safeDuration / 60), 1);

          // ── Minimum threshold guard ───────────────────────────────────
          // Workouts under 60 s AND under 100 m are test taps / accidental
          // starts. Skip save + XP + streak so they don't pollute history.
          if (safeDuration < 60 && safeDistance < 0.1) {
            console.log('[useRunningPlayer] Below minimum threshold — skipping save');
            sessionState.endSession();
            return;
          }

          // ── XP calculation (must happen BEFORE save so xpEarned is on doc) ──
          // Commute sessions use a slimmer formula (no distance bonus,
          // gentler base rate) so that a 10-minute walk to work doesn't
          // pay the same XP as a 10-minute training run. See
          // calculateCommuteXP in xp.service.ts for the trade-off
          // rationale and config in xp-rules.ts.
          const { useProgressionStore } = await import('@/features/user/progression/store/useProgressionStore');
          const { calculateRunningWorkoutXP, calculateCommuteXP } = await import('@/features/user/progression/services/xp.service');
          const progressionState = useProgressionStore.getState();
          const sessionXP = isCommute
            ? calculateCommuteXP({
                durationMinutes,
                distanceKm: safeDistance,
                streak: progressionState.currentStreak,
              })
            : calculateRunningWorkoutXP({
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

          // ── Resolve group session fields before building the payload ──
          // Only tag a workout as group when the user EXPLICITLY started a
          // group run (isGroupRun=true). CommunitySessionBanner auto-sets
          // useSharedSession.groupId for all joined members even when they
          // are doing a solo run — we must not inherit that stale groupId.
          const _sharedSession = useSharedSession.getState();
          const groupSessionFields: { groupId?: string; attendanceId?: string } =
            get().isGroupRun && _sharedSession.groupId && _sharedSession.attendanceId
              ? { groupId: _sharedSession.groupId, attendanceId: _sharedSession.attendanceId }
              : {};

          // ── Build the single authoritative workout document ───────────
          // Commute sessions are tagged via `sessionKind: 'commute'` plus
          // the optional destination metadata. We deliberately do NOT
          // change `workoutType` (which stays 'running') so existing
          // history filters / category groupings still see the activity
          // — the slim summary screen branches on `sessionKind` to
          // hide celebratory chrome.
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
            ...(isCommute
              ? {
                  sessionKind: 'commute' as const,
                  ...(commuteContext
                    ? {
                        commuteDestination: [
                          commuteContext.destination.lng,
                          commuteContext.destination.lat,
                        ] as [number, number],
                        ...(commuteContext.label ? { commuteLabel: commuteContext.label } : {}),
                      }
                    : {}),
                }
              : {}),
            // Group session linkage — lets summary screen and future analytics
            // query sibling workouts for the collective distance block.
            ...groupSessionFields,
          };

          console.log('🚀 [useRunningPlayer] Saving workout (single write)...', {
            distance: safeDistance, duration: safeDuration, laps: completedLaps.length,
            elevation: safeElevation, xp: sessionXP, park: detectedPark?.parkName ?? 'none',
          });

          let workoutSaved = false;
          try {
            const savedId = await saveWorkout(workoutPayload);
            if (savedId) {
              workoutSaved = true;
              // Store the confirmed snapshot so summary screens show exactly
              // what was written, not in-memory approximations.
              // category/displayIcon are omitted from workoutPayload (storage.service derives them);
              // cast is safe because this snapshot is display-only, not re-written to Firestore.
              set({
                savedWorkoutSnapshot: { ...workoutPayload, date: new Date() } as WorkoutHistoryEntry,
                savedWorkoutId: savedId,
              });
              console.log('✅ [useRunningPlayer] Workout saved:', savedId);
            } else {
              console.error('❌ [useRunningPlayer] saveWorkout returned null');
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
              const { addDoc, collection, serverTimestamp, doc, updateDoc } = await import('firebase/firestore');
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
              // Remember the user's most-recent park so the Park league card
              // surfaces automatically in /community (read by useArenaAccess).
              if (fbAuth.currentUser) {
                updateDoc(doc(db, 'users', fbAuth.currentUser.uid), {
                  'core.preferredParkId': detectedPark!.parkId,
                  'core.preferredParkName': detectedPark!.parkName,
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          // Social feed post — skipped for commutes by design. Daily
          // commutes are private by default (a school-run shouldn't
          // become a public broadcast). When/if we add a "share my
          // commute" toggle, gate this branch on that opt-in flag.
          // COMMUNITY_FEED_PAUSED: Also gated by IS_COMMUNITY_FEED_ENABLED to
          // stop ghost Firestore writes during the MVP freeze.
          if (IS_COMMUNITY_FEED_ENABLED && workoutSaved && !isCommute) {
            import('@/features/social/services/feed.service').then(async ({ createWorkoutPost }) => {
              const { extractFeedScope, extractGroupIds } = await import('@/features/social/services/feed-scope.utils');
              const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
              const userProfile = useUserStore.getState().profile;
              if (userProfile?.core?.name) {
                // Determine completed distance bracket
                const runSegment: '3k' | '5k' | '10k' | null =
                  safeDistance >= 10 ? '10k' :
                  safeDistance >= 5  ? '5k'  :
                  safeDistance >= 3  ? '3k'  : null;

                // Average pace in seconds per km (more precise than durationMinutes-based calc)
                const paceSecPerKm =
                  safeDistance > 0 && safeDuration > 0
                    ? Math.round(safeDuration / safeDistance)
                    : undefined;

                createWorkoutPost({
                  authorUid: currentUser.uid,
                  authorName: userProfile.core.name,
                  activityCategory: 'cardio',
                  durationMinutes,
                  distanceKm: safeDistance > 0 ? safeDistance : undefined,
                  paceMinPerKm: safePace > 0 ? safePace : undefined,
                  paceSecPerKm,
                  runSegment,
                  ...extractFeedScope(userProfile),
                  groupIds: extractGroupIds(userProfile),
                  parkId: detectedPark?.parkId,
                  parkName: detectedPark?.parkName,
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          // Award XP via Guardian (authoritative server write).
          // Commute and workout sessions go through the same Guardian
          // Cloud Function (`awardWorkoutXP`) but with different
          // `source` strings so the audit log can distinguish them.
          if (isCommute) {
            progressionState
              .awardCommuteXP({
                durationMinutes,
                distanceKm: safeDistance,
                streak: progressionState.currentStreak,
              })
              .catch((e) => console.warn('[useRunningPlayer] awardCommuteXP failed:', e));
          } else {
            progressionState
              .awardRunningXP({
                durationMinutes,
                distanceKm: safeDistance,
                streak: progressionState.currentStreak,
                activityType: (activityType as 'running' | 'walking') ?? 'running',
              })
              .catch((e) => console.warn('[useRunningPlayer] awardRunningXP failed:', e));
          }

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
        // Drop commute intent + map pin once the session is persisted.
        // The slim FreeRunSummary reads the commute flag from
        // `savedWorkoutSnapshot.sessionKind`, not from this in-memory
        // context, so clearing here doesn't break the summary screen.
        if (isCommute) {
          set({ sessionMode: 'workout', commuteContext: null });
          if (typeof window !== 'undefined') {
            try {
              const { useMapStore } = await import('@/features/parks/core/store/useMapStore');
              useMapStore.getState().setCommuteDestination(null);
            } catch { /* non-fatal */ }
          }
        }
      }
    }
  },

  // ── deleteLastWorkout ──────────────────────────────────────────────────────
  // Called from the summary screen "בטל אימון" button. Deletes the Firestore
  // doc written by finishWorkout and reverses the XP award via the Guardian.
  // Streak reversal (daysActive) is best-effort: if the workout was the only
  // one today, we decrement daysActive and clear lastActiveDate.
  deleteLastWorkout: async () => {
    const { savedWorkoutId, savedWorkoutSnapshot } = get();
    if (!savedWorkoutId) {
      console.warn('[deleteLastWorkout] No saved workout ID — nothing to delete');
      return false;
    }

    try {
      const { deleteWorkout } = await import('@/features/workout-engine/core/services/storage.service');
      const deleted = await deleteWorkout(savedWorkoutId);
      if (!deleted) return false;

      // Reverse XP via Guardian (negative delta)
      const xpToReverse = savedWorkoutSnapshot?.xpEarned ?? 0;
      if (xpToReverse > 0) {
        import('@/lib/awardWorkoutXP').then(({ awardWorkoutXP }) => {
          awardWorkoutXP({ xpDelta: -xpToReverse, source: 'workout:delete' }).catch(() => {});
        }).catch(() => {});
      }

      // Reverse streak: if deleted workout was today's only one, roll back daysActive
      import('@/lib/firebase').then(async ({ auth, db }) => {
        const { collection, query, where, getDocs, doc, getDoc, updateDoc } = await import('firebase/firestore');
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const today = new Date().toISOString().split('T')[0];
        // Count remaining workouts for today (deleted one is already gone)
        const q = query(collection(db, 'workouts'), where('userId', '==', uid));
        const snap = await getDocs(q);
        const todayRemaining = snap.docs.filter(d => {
          const ts = d.data().date;
          const dateStr = ts?.toDate ? ts.toDate().toISOString().split('T')[0] : '';
          return dateStr === today;
        }).length;
        if (todayRemaining === 0) {
          const userRef = doc(db, 'users', uid);
          const userSnap = await getDoc(userRef);
          const daysActive: number = userSnap.data()?.progression?.daysActive ?? 0;
          updateDoc(userRef, {
            'progression.daysActive': Math.max(0, daysActive - 1),
            'progression.lastActiveDate': '',
          }).catch(() => {});
        }
      }).catch(() => {});

      // Clear local state
      set({ savedWorkoutId: null, savedWorkoutSnapshot: null });
      console.log('[deleteLastWorkout] Deleted:', savedWorkoutId);
      return true;
    } catch (err) {
      console.error('[deleteLastWorkout] Failed:', err);
      return false;
    }
  },

  setMapFollowEnabled: (v) => set({ isMapFollowEnabled: v }),

  // When devSim enables mock: kill any live real GPS watcher + mark status as simulated.
  // When devSim disables mock: clear the flag; next startGPSTracking call uses real GPS.
  setSimulationActive: (active: boolean) => {
    const { isSimulationActive: prev, gpsWatchId } = get();
    set({ isSimulationActive: active });
    if (active && !prev) {
      // Transitioning INTO simulation — cancel the useGPSStore subscription
      _gpsStoreUnsub?.();
      _gpsStoreUnsub = null;
      set({ gpsWatchId: null });
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
