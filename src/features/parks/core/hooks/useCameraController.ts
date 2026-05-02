/**
 * useCameraController — Single owner of all Mapbox camera movements.
 *
 * Camera ownership model:
 *   'user'    → user manually panned/zoomed — pitch 0°, north-up, camera stops tracking
 *   'follow'  → active workout or navigation: pitch 45°, zoom 17, tracks userBearing
 *   'preview' → idle: show route preview, destination, initial zoom (flat)
 *
 * Active-workout camera modes
 * ───────────────────────────
 *   FOLLOW (default / after recenter):
 *     pitch 45°  |  zoom 17  |  bearing = userBearing  |  easeTo 800 ms
 *   FREE (user panned):
 *     pitch 0°  |  zoom stays  |  bearing 0° (north)  |  no tracking
 *     Triggered by any touch/pan/wheel during an active workout.
 *     Reversed by tapping the "מרכז אותי" recenter button.
 *
 * NaN safety:
 *   Every Mapbox camera call (jumpTo / easeTo / flyTo / fitBounds) is
 *   guarded by `isFiniteLatLng(currentLocation)` BEFORE the call, AND
 *   wrapped in a try/catch so a Mapbox internal "LngLat invalid" never
 *   unmounts the map tree. This is critical for desktop testing (no
 *   GPS) and for the moments between an `error: 3` GPS timeout and the
 *   next valid sample.
 */
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import type { MapRef } from 'react-map-gl';
import type { Route } from '../types/route.types';
import type { RouteTurn } from '../services/geoUtils';
import { bearingBetween, haversineMeters } from '../services/geoUtils';
import { isFiniteLatLng, isFiniteNum } from '@/utils/geoValidation';
import { useMapStore } from '../store/useMapStore';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';

export type CameraOwner = 'user' | 'follow' | 'preview';

export interface CameraControllerParams {
  mapRef: React.RefObject<MapRef | null>;
  isMapLoaded: boolean;

  currentLocation: { lat: number; lng: number } | null | undefined;
  userBearing: number;
  speedKmH: number;

  isNavigationMode: boolean;
  isActiveWorkout: boolean;
  simulationActive: boolean;

  focusedRoute: Route | null | undefined;
  routes: Route[];
  destinationMarker: { lat: number; lng: number } | null | undefined;

  skipInitialZoom: boolean;

  isAutoFollowEnabled: boolean;
  onUserPanDetected: (() => void) | undefined;

  /**
   * Current map mode (discover, navigate, free_run, …). Used to gate the
   * one-shot "fit all displayed routes" pass that runs the first time the
   * user enters discover mode with multiple routes loaded.
   */
  mapMode?: string;
  /**
   * The walk-to-route target endpoint (whichever end of the focused route is
   * closer to the user). When set, the camera rotates to face this point
   * instead of the raw GPS heading — so after tapping "מרכז אותי" the map
   * orients toward the route rather than the user's current movement direction.
   * Cleared automatically by useWalkToRoute once the user arrives.
   */
  walkToRouteTarget?: { lat: number; lng: number } | null;
  /**
   * Current navigation turn list. Used to compute the distance to the next
   * maneuver point and switch the camera into "approaching turn" mode
   * (higher pitch, tighter zoom) when within TURN_APPROACH_DIST_M metres.
   * Pass null / undefined when no guided route is active.
   */
  navigationTurns?: RouteTurn[] | null;
}

export interface CameraControllerAPI {
  onMapReady: (rawMap: mapboxgl.Map) => void;
  recenter: () => void;
  owner: CameraOwner;
}

// ── Immersive navigation camera presets ─────────────────────────────────────
//
// Three states, each with its own pitch + zoom:
//
//   STRAIGHT — standard running view.  High 60° pitch keeps a Waze-style
//              horizon; zoom 17 shows ~150 m of road ahead.
//
//   TURN     — activated when the nearest maneuver is ≤ TURN_APPROACH_DIST_M
//              metres away.  Pitch rises to 75° so the junction fills the
//              bottom of the screen.  Zoom tightens to 18.5 to put the
//              corner front-and-centre.  Metrics card is already bottom-
//              locked during navigation so it never occludes the junction.
//
//   STOPPED  — used when the workout session is paused.  Flatten to 45° /
//              zoom 16 so the runner can see their surroundings while resting.
//
// Non-navigation follow (free run, sim-discover) keeps the legacy
// FOLLOW_PITCH / FOLLOW_ZOOM values (45° / 17) so those modes are
// unaffected by this change.
const NAV_PITCH_STRAIGHT  = 60;
const NAV_ZOOM_STRAIGHT   = 17;
const NAV_PITCH_TURN      = 75;
const NAV_ZOOM_TURN       = 18.5;
const NAV_PITCH_STOPPED   = 45;
const NAV_ZOOM_STOPPED    = 16;

/** Distance (metres) at which the camera switches to "approaching turn" mode. */
const TURN_APPROACH_DIST_M = 50;

// Legacy follow values — kept for non-navigation contexts (free run with no
// guided route, sim-discover follow, future modes). See preset table above.
const FOLLOW_ZOOM = 17;
const FOLLOW_PITCH = 45;

/**
 * Compute the straight-line distance (metres) from `location` to the nearest
 * turn in `turns`. Returns null when location or turns are unavailable.
 * Used to gate the "approaching turn" camera state.
 */
function getDistToNextTurnM(
  location: { lat: number; lng: number } | null | undefined,
  turns: RouteTurn[] | null | undefined,
): number | null {
  if (!isFiniteLatLng(location) || !turns?.length) return null;
  let minDist = Infinity;
  for (const t of turns) {
    if (!isFiniteNum(t.lat) || !isFiniteNum(t.lng)) continue;
    const d = haversineMeters(location.lat, location.lng, t.lat, t.lng);
    if (d < minDist) minDist = d;
  }
  return Number.isFinite(minDist) ? minDist : null;
}

/**
 * Bearing EMA blend factor.
 * The smoothed bearing fed to Mapbox is updated as
 *   smoothed = smoothed + BEARING_EMA_ALPHA * shortestPathDelta(raw, smoothed)
 * on every raw-bearing update. 0.25 is the Waze sweet spot:
 *   • Big enough that turning a corner reaches ~90 % of the new heading
 *     in ~3 GPS samples (~3 s) — the camera follows the runner cleanly.
 *   • Small enough that GPS noise (raw heading flickering ±20° between
 *     samples while jogging slowly) is dampened to a steady drift
 *     rather than a visible wobble.
 * Pair with Mapbox easeTo's 800 ms interpolation to get a doubly-
 * smoothed rotation: source noise is filtered, and the easing softens
 * the remaining motion across the animation duration.
 */
const BEARING_EMA_ALPHA = 0.25;

/**
 * Waze-style bottom anchor for the user dot — ADAPTIVE.
 *
 * Math (Mapbox semantics — verified empirically against device output
 * on 2026-05-01: `padding.bottom = 0.6 * H` placed the dot at TOP 25 %,
 * not bottom 25 %, contradicting the previous comment in this file).
 *
 *   `padding.bottom = B` reserves B px at the bottom of the canvas.
 *   `padding.top    = T` reserves T px at the top.
 *   Mapbox places the geographic centre at the centre of the
 *   UN-padded area:
 *       y_screen = (T + (H − B)) / 2     (measured from canvas top)
 *
 *   So the user dot sits at
 *       fromBottom = 1 − y_screen / H
 *                  = (H − T + B) / (2 H)
 *
 * Two regimes — the camera switches between them when the metrics
 * card snaps into a new position (see `metricsCardPosition` in
 * useMapStore, written by useDraggableMetrics):
 *
 *   • CARD AT TOP (or no card)
 *     Padding: { top: H * WAZE_TOP_FRAC, bottom: 0 }
 *     With WAZE_TOP_FRAC = 0.5 → fromBottom = 25 %.
 *     The dot sits low and the runner sees lots of road ahead.
 *
 *   • CARD AT BOTTOM (during navigation)
 *     Padding: { top: 0, bottom: WAZE_CARD_BOTTOM_PX }
 *     With WAZE_CARD_BOTTOM_PX = 320 px on H = 800 →
 *         y_screen = (0 + 800 − 320)/2 = 240 → dot at 70 % from bottom.
 *     The dot is pushed clear of the bottom card chrome so the runner
 *     can see their location AND the card metrics simultaneously,
 *     fixing the "dot covered by card" complaint David flagged.
 *
 * We keep the two regimes physically distinct (rather than
 * superposing top + bottom padding) because Mapbox's available
 * height = H − T − B, and combining 0.5 H + 320 on small screens
 * leaves a degenerate 80 px window — the dot becomes uncomputable.
 *
 * Tuning levers:
 *   • WAZE_TOP_FRAC ↓ (e.g. 0.4) → dot 30 % from bottom in 'top' mode.
 *   • WAZE_CARD_BOTTOM_PX ↓ (e.g. 240) → dot less aggressively raised.
 */
const WAZE_TOP_FRAC = 0.5;
/**
 * Bottom-padding budget when the metrics card is at the bottom edge.
 * Sized to be ≥ a typical expanded metrics card (~280 px) so the
 * dot lands clear of the card; not so large that the camera can't
 * fit the road ahead.
 */
const WAZE_CARD_BOTTOM_PX = 320;

/**
 * Idle-recenter delay after the user manually pans / rotates.
 * 15 000 ms per spec — long enough that an accidental thumb-graze
 * mid-stride doesn't fight the runner's intent, short enough that the
 * map snaps back to follow before the runner needs the next maneuver.
 */
const IDLE_RECENTER_MS = 15000;

/**
 * Compute the shortest signed angular delta between two compass bearings,
 * normalised into the range [-180, 180]. Used for both the bearing EMA
 * and (implicitly) for verifying Mapbox takes the short way around when
 * we cross the 0 / 360 boundary mid-rotation.
 *
 * Worked example:
 *   shortestBearingDelta(350, 10)  = +20    (clockwise short way)
 *   shortestBearingDelta(10, 350)  = -20    (counter-clockwise short way)
 *   shortestBearingDelta(0, 180)   = +180   (either direction is equal)
 */
function shortestBearingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function useCameraController(params: CameraControllerParams): CameraControllerAPI {
  const {
    mapRef, isMapLoaded, currentLocation, userBearing,
    isNavigationMode, isActiveWorkout, simulationActive,
    focusedRoute, routes, destinationMarker,
    skipInitialZoom, isAutoFollowEnabled, onUserPanDetected,
    mapMode, walkToRouteTarget, navigationTurns,
  } = params;

  // Session status: distinguishes 'paused' from 'active' so the camera can
  // flatten to NAV_PITCH_STOPPED when the runner stops. Cross-feature read
  // is permitted per the project's architecture rules.
  const sessionStatus = useSessionStore((s) => s.status);

  // Keep turns in a ref so the camera effect can read the latest value
  // without turns changes triggering extra re-runs of the main effect.
  const navigationTurnsRef = useRef(navigationTurns ?? null);
  useEffect(() => { navigationTurnsRef.current = navigationTurns ?? null; }, [navigationTurns]);

  const ownerRef = useRef<CameraOwner>('preview');
  const hasInitialZoomed = useRef(false);
  const prevSimActive = useRef(false);
  const rawMapRef = useRef<mapboxgl.Map | null>(null);

  // Fix 1: keep bearing in a ref so bearing updates never re-trigger the
  // main camera effect — only position changes should drive easeTo.
  const userBearingRef = useRef(userBearing);

  // Smoothed bearing fed to the camera. Raw GPS heading is too noisy on
  // its own — `pos.coords.heading` from `watchPosition` flickers ±20°
  // between samples when a runner is moving slowly, which made the map
  // visibly wobble even though Mapbox's easeTo was animating cleanly.
  // The circular EMA below dampens the noise; Mapbox's 800 ms ease
  // does the rest. Initial value matches the raw to avoid a startup
  // animation from 0°.
  const smoothedBearingRef = useRef(userBearing);

  useEffect(() => {
    // Update raw immediately (the user-marker rotation reads this and
    // wants snap response so it doesn't lag behind the runner).
    userBearingRef.current = userBearing;

    // Update smoothed via shortest-path EMA. We MUST go through
    // shortestBearingDelta — naive `prev + alpha * (raw - prev)` on
    // the same wrap (e.g. raw=10°, prev=350°) would average to 180°
    // which would spin the camera the long way round.
    if (Number.isFinite(userBearing)) {
      const delta = shortestBearingDelta(smoothedBearingRef.current, userBearing);
      const next = smoothedBearingRef.current + BEARING_EMA_ALPHA * delta;
      // Re-normalise into [0, 360) so consumers always see a canonical
      // compass bearing (Mapbox accepts unwrapped values too, but
      // keeping it canonical makes debugging easier).
      smoothedBearingRef.current = (next + 360) % 360;
    }
  }, [userBearing]);

  // Walk-to-route target endpoint — when set, the follow bearing points toward
  // the route rather than the GPS heading, so recenter faces "where to go".
  const walkToRouteTargetRef = useRef(walkToRouteTarget ?? null);
  useEffect(() => { walkToRouteTargetRef.current = walkToRouteTarget ?? null; }, [walkToRouteTarget]);

  // Refs for breakFollow — onMapReady is a one-time callback and cannot close
  // over reactive state, so we sync workout mode into refs for it to read.
  const isActiveWorkoutRef = useRef(isActiveWorkout);
  useEffect(() => { isActiveWorkoutRef.current = isActiveWorkout; }, [isActiveWorkout]);
  const isNavigationModeRef = useRef(isNavigationMode);
  useEffect(() => { isNavigationModeRef.current = isNavigationMode; }, [isNavigationMode]);

  // Fix 2: debounce timer — cancels competing camera moves when isActiveWorkout,
  // isNavigationMode, or mapMode all change in rapid succession at workout start.
  const cameraDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Idle-recenter machinery ──────────────────────────────────────────────
  // After the user manually pans / rotates / zooms, we set a 15 s timer.
  // If they don't touch the map again within that window, the camera auto
  // -snaps back to follow. Safety net for accidental thumb-grazes mid-stride.
  // Only armed during active workout / navigation — in preview mode the
  // user is exploring intentionally and we don't want to fight them.
  const idleRecenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tick counter forces the camera effect to re-run when the idle timer
  // fires. We can't rely on currentLocation changing because a stationary
  // runner (or a paused workout) won't produce new GPS samples; bumping
  // this counter lands inside the effect's dep array (see below) and
  // executes one easeTo with the latest follow params.
  const [recenterTick, setRecenterTick] = useState(0);

  // ── Focused-route fit debounce ──
  // Carousel scrolling fires setFocusedRoute on every snap; without a debounce
  // each card causes a 600 ms map animation, making the map feel like it's
  // chasing the user. We track the last route id we *triggered* a fit for and
  // only schedule a fitBounds 600 ms after the focus settles. Rapid changes
  // cancel the pending timer and restart it, so only the final resting card
  // ever drives a camera move.
  const lastFocusedRouteIdRef = useRef<string | null>(null);
  const fitBoundsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── One-shot fit-all on entering discover mode ──
  // The first time discover mode mounts with ≥2 routes loaded we want the
  // user to see the full set, not just the auto-focused first card. After
  // the fit-all completes we mark `lastFocusedRouteIdRef` to the currently
  // focused route id so the immediate "auto-focus to routes[0]" effect in
  // DiscoverLayer doesn't re-fit on top of it.
  const hasDoneInitialDiscoverFit = useRef(false);

  // Reset the discover-fit flag when leaving discover mode so that
  // re-entering performs the fit-all again.
  useEffect(() => {
    if (mapMode !== 'discover') {
      hasDoneInitialDiscoverFit.current = false;
      lastFocusedRouteIdRef.current = null;
      if (fitBoundsDebounceRef.current) {
        clearTimeout(fitBoundsDebounceRef.current);
        fitBoundsDebounceRef.current = null;
      }
    }
  }, [mapMode]);

  // Cleanup debounce timers on unmount.
  useEffect(() => {
    return () => {
      if (fitBoundsDebounceRef.current) {
        clearTimeout(fitBoundsDebounceRef.current);
        fitBoundsDebounceRef.current = null;
      }
      if (cameraDebounceRef.current) {
        clearTimeout(cameraDebounceRef.current);
        cameraDebounceRef.current = null;
      }
      if (idleRecenterTimerRef.current) {
        clearTimeout(idleRecenterTimerRef.current);
        idleRecenterTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Schedule a 15 s auto-recenter after the user has manually broken
   * follow. Restarts the clock on every call so consecutive pans
   * extend the wait — the timer only fires when the map has been
   * truly idle for the full IDLE_RECENTER_MS.
   *
   * Guard: only armed during workout / navigation. In preview mode
   * we let the user explore as long as they want.
   */
  const scheduleIdleRecenter = useCallback(() => {
    if (idleRecenterTimerRef.current) {
      clearTimeout(idleRecenterTimerRef.current);
      idleRecenterTimerRef.current = null;
    }
    if (!isActiveWorkoutRef.current && !isNavigationModeRef.current) return;

    idleRecenterTimerRef.current = setTimeout(() => {
      // The user might have already tapped recenter (manually) before
      // the 15 s elapsed. If so, owner is already 'follow' — no-op.
      if (ownerRef.current !== 'user') return;
      console.log(
        `[Cam] Idle ${IDLE_RECENTER_MS / 1000}s — auto-recentering for runner safety.`,
      );
      ownerRef.current = 'follow';
      // Force the camera effect to re-run so the easeTo dispatches even
      // when GPS isn't producing new samples (stationary runner).
      setRecenterTick((t) => t + 1);
    }, IDLE_RECENTER_MS);
  }, []);

  const onUserPanDetectedRef = useRef(onUserPanDetected);
  useEffect(() => { onUserPanDetectedRef.current = onUserPanDetected; }, [onUserPanDetected]);

  // Detect TRANSITIONS only (false→true = recenter, true→false = user broke follow)
  const prevFollowEnabled = useRef(isAutoFollowEnabled);
  useEffect(() => {
    const was = prevFollowEnabled.current;
    prevFollowEnabled.current = isAutoFollowEnabled;
    if (!was && isAutoFollowEnabled) { ownerRef.current = 'follow'; }
    if (was && !isAutoFollowEnabled) { ownerRef.current = 'user'; }
  }, [isAutoFollowEnabled]);

  // Claim 'follow' when entering workout/nav; release to 'preview' on exit
  useEffect(() => {
    if ((isActiveWorkout || isNavigationMode) && ownerRef.current === 'preview') {
      ownerRef.current = 'follow';
    }
    if (!isActiveWorkout && !isNavigationMode && ownerRef.current === 'follow') {
      ownerRef.current = 'preview';
    }
  }, [isActiveWorkout, isNavigationMode]);

  // ── Waze-style bottom anchor for the user dot — ADAPTIVE ──
  // The padding switches between two regimes whenever the metrics card
  // snaps into a new position. See the WAZE_TOP_FRAC docstring for the
  // full derivation; the short version:
  //   • card 'top' (or no card) → top-pad 50 % of H, bottom-pad 0 →
  //     dot lands 25 % from bottom (lots of road ahead).
  //   • card 'bottom' (navigation) → top-pad 0, bottom-pad 320 px →
  //     dot lands ~70 % from bottom (clear of the card chrome).
  //
  // Read from the store rather than props so we don't have to drill
  // through MapShell/AppMap for what is effectively a UI-layout
  // signal. When no running session is mounted the store stays at
  // 'top' and the camera behaves identically to before.
  const metricsCardPosition = useMapStore((s) => s.metricsCardPosition);

  const wazePadding = useMemo(() => {
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    if (metricsCardPosition === 'bottom') {
      // Card-at-bottom regime: lift the focal point well above the card.
      const fromBottom = Math.round(((WAZE_CARD_BOTTOM_PX) / (2 * H) + 0.5) * 100);
      console.log(
        `[Cam] wazePadding: card=BOTTOM, H=${H}px, top=0, bottom=${WAZE_CARD_BOTTOM_PX}px → ` +
          `user dot at ~${fromBottom}% from bottom (raised to clear card)`,
      );
      console.log('[Cam] Adaptive padding active: dot pushed UP for bottom card');
      return { top: 0, bottom: WAZE_CARD_BOTTOM_PX, left: 0, right: 0 };
    }
    // Card-at-top regime: standard Waze framing — dot at 25 % from bottom.
    const top = Math.round(H * WAZE_TOP_FRAC);
    const fromBottomPct = Math.round(((1 - WAZE_TOP_FRAC) / 2) * 100);
    console.log(
      `[Cam] wazePadding: card=TOP, H=${H}px, top=${top}px, bottom=0 → ` +
        `user dot at ~${fromBottomPct}% from bottom (default Waze framing)`,
    );
    return { top, bottom: 0, left: 0, right: 0 };
  }, [metricsCardPosition]);

  // Follow mode uses FOLLOW_ZOOM / FOLLOW_PITCH constants (see top of file).
  // Speed-adaptive zoom/pitch removed — adds complexity without clear user benefit.

  // ═══════════════════════════════════════════════════════
  // SINGLE CAMERA EFFECT
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const rawMap = map.getMap();
    if (!rawMap) return;

    const owner = ownerRef.current;

    // ── P0: Simulation start snap (one-shot, always immediate — never debounced) ──
    // `isFiniteLatLng` rejects null, undefined, AND `{lat: NaN, lng: NaN}`.
    // The plain `currentLocation` truthy check used to admit
    // `{lat: NaN, lng: NaN}` straight into Mapbox, which threw the
    // "LngLat invalid: NaN, NaN" exception that unmounted the map.
    if (simulationActive && !prevSimActive.current && isFiniteLatLng(currentLocation)) {
      ownerRef.current = 'follow';
      console.log('[Cam] sim-start snap');
      try {
        // smoothedBearingRef is typically valid by sim-start time, but on
        // the very first session it can be NaN until the first GPS sample
        // lands. Mapbox treats NaN as `null` and throws "Expected value
        // to be of type number, but found null". Clamp here so the
        // sim-snap call is always finite-safe.
        const safeBearing = Number.isFinite(smoothedBearingRef.current)
          ? smoothedBearingRef.current
          : 0;
        rawMap.jumpTo({
          center: [currentLocation.lng, currentLocation.lat],
          zoom: NAV_ZOOM_STRAIGHT, pitch: NAV_PITCH_STRAIGHT,
          bearing: safeBearing, padding: wazePadding,
        });
      } catch (err) {
        console.error('[Cam] sim-start jumpTo threw — ignored.', err);
      }
      prevSimActive.current = simulationActive;
      return;
    }
    prevSimActive.current = simulationActive;

    if (owner === 'user') return;

    // Fix 2: when in active workout/nav follow-mode, debounce the camera move by
    // 200 ms so that rapid sequential effect runs (isActiveWorkout, isNavigationMode,
    // and mapMode all changing at workout-start) collapse into a single camera call.
    // Preview mode runs immediately (no debounce) to keep discover snappy.
    const executeFollowAndPreview = () => {
      if (!mapRef.current) return;
      const m = mapRef.current;
      const rm = m.getMap();
      if (!rm || ownerRef.current === 'user') return;

      // When a walk-to-route target is active, rotate toward the destination
      // rather than the runner heading. Once the user arrives, the hook clears
      // the target and we fall back to heading-up rotation seamlessly.
      // For the heading-up case we use `smoothedBearingRef` (circular EMA over
      // raw GPS heading) so the camera doesn't wobble when the runner is
      // moving slowly and the GPS compass is noisy. See BEARING_EMA_ALPHA.
      const target = walkToRouteTargetRef.current;
      const safeSmoothedBearing = Number.isFinite(smoothedBearingRef.current)
        ? smoothedBearingRef.current
        : 0;
      // ── Nuclear target sanitiser ─────────────────────────────────
      // Belt-and-braces: extract lat/lng with `?? 0` then re-check
      // finiteness. The `?? 0` swap converts a `null` field into a
      // finite `0` so the subsequent `bearingBetween` call NEVER feeds
      // null into trigonometry (which would propagate NaN through every
      // camera param). The validity flag below then SUPPRESSES the
      // bearing computation entirely when the original data was bad —
      // we don't want to point at "(0, 0) lng/lat" by accident, just
      // make sure no null reaches Mapbox.
      const targetLat = target?.lat ?? 0;
      const targetLng = target?.lng ?? 0;
      const targetIsFinite =
        !!target &&
        Number.isFinite(target.lat) &&
        Number.isFinite(target.lng);

      // Compute the desired bearing then ALWAYS clamp to a finite number.
      // bearingBetween() returns NaN when the two points coincide (user
      // standing exactly on the walk-to-route target) — passing NaN to
      // Mapbox's easeTo throws "Expected number, found null/NaN" deep
      // inside the camera animator. The clamp eliminates that class of
      // crash regardless of upstream regressions.
      const computedBearing =
        targetIsFinite && isFiniteLatLng(currentLocation)
          ? bearingBetween(currentLocation.lat, currentLocation.lng, targetLat, targetLng)
          : safeSmoothedBearing;
      const bearing = Number.isFinite(computedBearing)
        ? computedBearing
        : safeSmoothedBearing;

      // ── P1: Follow (workout / navigation / sim-in-discover) ──
      // `isFiniteLatLng` is the SINGLE source of truth for "do I have a
      // usable GPS fix?". Bare truthy check used to admit
      // `{lat: NaN, lng: NaN}` and crash Mapbox; this rejects it.
      if (ownerRef.current === 'follow' && isFiniteLatLng(currentLocation)) {
        const center: [number, number] = [currentLocation.lng, currentLocation.lat];

        if (isNavigationMode || isActiveWorkout) {
          // ── Immersive camera state machine ─────────────────────────────
          // Selects pitch + zoom based on workout session state and
          // proximity to the next turn maneuver.
          const isSessionPaused = sessionStatus === 'paused';
          const distToNextTurnM = getDistToNextTurnM(currentLocation, navigationTurnsRef.current);

          let targetPitch: number;
          let targetZoom: number;

          if (isSessionPaused) {
            // Flatten the camera so the runner can see their surroundings.
            targetPitch = NAV_PITCH_STOPPED;
            targetZoom  = NAV_ZOOM_STOPPED;
            console.log('[Cam] state=STOPPED (paused)');
          } else if (distToNextTurnM !== null && distToNextTurnM < TURN_APPROACH_DIST_M) {
            // Zoom into the junction — maximum pitch shows the corner detail.
            targetPitch = NAV_PITCH_TURN;
            targetZoom  = NAV_ZOOM_TURN;
            console.log(`[Cam] state=TURN (${Math.round(distToNextTurnM)}m to next maneuver)`);
          } else {
            // Standard running view: high immersive pitch, road-ahead zoom.
            targetPitch = NAV_PITCH_STRAIGHT;
            targetZoom  = NAV_ZOOM_STRAIGHT;
          }

          // ── Adaptive duration ───────────────────────────────────────────
          // When pitch or zoom need to change (state transition), use the
          // 800 ms smooth duration so the camera glides between states.
          // Routine bearing+centre updates use 200 ms for a snappy feel.
          // getPitch/getZoom return null mid-style-load on rare occasions —
          // fall back to the targets so isStateTransition resolves to false
          // (a 200 ms ease) rather than throwing on Math.abs(null).
          const currentMapPitch = rm.getPitch();
          const currentMapZoom  = rm.getZoom();
          const safeMapPitch = Number.isFinite(currentMapPitch) ? currentMapPitch : targetPitch;
          const safeMapZoom  = Number.isFinite(currentMapZoom)  ? currentMapZoom  : targetZoom;
          const isStateTransition =
            Math.abs(safeMapPitch - targetPitch) > 2 ||
            Math.abs(safeMapZoom  - targetZoom)  > 0.3;
          const duration = isStateTransition ? 800 : 200;

          const logTag = isNavigationMode ? 'nav-follow' : 'workout-follow';
          console.log(`[Cam] ${logTag} pitch=${targetPitch} zoom=${targetZoom} dur=${duration}ms`);
          // Final safety pass — every numeric param Mapbox will see must
          // be finite. If anything regressed upstream, drop the call
          // rather than crash the map tree.
          if (
            !Number.isFinite(center[0]) || !Number.isFinite(center[1]) ||
            !Number.isFinite(targetZoom) || !Number.isFinite(targetPitch) ||
            !Number.isFinite(bearing)
          ) {
            console.warn('[Cam] camera call skipped — non-finite param.', { center, targetZoom, targetPitch, bearing });
            return;
          }
          try {
            if (simulationActive) {
              rm.jumpTo({ center, zoom: targetZoom, pitch: targetPitch, bearing, padding: wazePadding });
            } else {
              m.easeTo({
                center, zoom: targetZoom, pitch: targetPitch,
                bearing, padding: wazePadding,
                duration, easing: (t: number) => t * (2 - t), essential: true,
              });
            }
          } catch (err) {
            console.error(`[Cam] ${logTag} camera call threw — ignored.`, err);
          }
          return;
        }

        // Sim in discover mode — follow with 3D perspective
        if (simulationActive) {
          console.log('[Cam] sim-discover-follow');
          // Final safety pass — same recipe as the workout/nav branch
          // above. FOLLOW_ZOOM / FOLLOW_PITCH are module constants so
          // they're always finite, but `bearing` and `center` come from
          // upstream signals that can briefly regress to NaN/null between
          // GPS samples. Skip the call instead of crashing the map tree.
          if (
            !Number.isFinite(center[0]) || !Number.isFinite(center[1]) ||
            !Number.isFinite(FOLLOW_ZOOM) || !Number.isFinite(FOLLOW_PITCH) ||
            !Number.isFinite(bearing)
          ) {
            console.warn('[Cam] sim-discover camera call skipped — non-finite param.', { center, bearing });
            return;
          }
          try {
            rm.jumpTo({
              center, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH,
              bearing, padding: wazePadding,
            });
          } catch (err) {
            console.error('[Cam] sim-discover-follow jumpTo threw — ignored.', err);
          }
          return;
        }
      }

      const currentOwner = ownerRef.current;
      // ── P2: Preview (flat, no 3D angle) ──
      if (currentOwner === 'preview' || currentOwner === 'follow') {
      // ── P2.0: First-time discover fit-all ──
      // When the user first lands in discover mode with multiple routes
      // loaded, fit ALL of them in one shot so the carousel content is
      // visible at a glance. We pre-mark `lastFocusedRouteIdRef` to the
      // currently focused route so the immediately-following "fit focused"
      // pass for the same route is skipped — no double animation.
      if (
        mapMode === 'discover' &&
        !hasDoneInitialDiscoverFit.current &&
        routes.length >= 2 &&
        !isActiveWorkout &&
        !isNavigationMode
      ) {
        const allCoords = routes
          .flatMap((r) => r.displayPath ?? r.path ?? [])
          .filter(
            (c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]),
          );
        if (allCoords.length >= 2) {
          try {
            const bounds = allCoords.reduce(
              ([minLng, minLat, maxLng, maxLat], [lng, lat]) => [
                Math.min(minLng, lng), Math.min(minLat, lat),
                Math.max(maxLng, lng), Math.max(maxLat, lat),
              ],
              [Infinity, Infinity, -Infinity, -Infinity],
            );
            console.log('[Cam] discover-fit-all (initial):', routes.length, 'routes');
            hasDoneInitialDiscoverFit.current = true;
            // Pre-mark the route DiscoverLayer's auto-focus will pick (routes[0])
            // so the immediately-following setFocusedRoute call doesn't queue
            // a debounced fit on top of this fit-all. If a focusedRoute is
            // already set (e.g. returning from another mode) we honor it.
            lastFocusedRouteIdRef.current = focusedRoute?.id ?? routes[0]?.id ?? null;
            m.fitBounds(bounds as [number, number, number, number], {
              padding: { top: 120, bottom: 280, left: 40, right: 40 },
              maxZoom: 15,
              duration: 800,
            });
            return;
          } catch { /* ignore */ }
        }
      }

      // ── P2.1: Focused route fit (debounced) ──
      // Prefer displayPath (rotated/user-prepended by useRouteFilter) so camera fits
      // the actual path the user will run, not just the stored Firestore geometry.
      const previewPath = focusedRoute?.displayPath ?? focusedRoute?.path;
      if (
        focusedRoute &&
        previewPath && previewPath.length > 1 &&
        !isActiveWorkout && !isNavigationMode
      ) {
        // Skip if we just fit this same route — prevents repeated fits when
        // unrelated state in the dep array changes (e.g. userBearing).
        if (focusedRoute.id !== lastFocusedRouteIdRef.current) {
          lastFocusedRouteIdRef.current = focusedRoute.id;
          if (fitBoundsDebounceRef.current) {
            clearTimeout(fitBoundsDebounceRef.current);
          }
          fitBoundsDebounceRef.current = setTimeout(() => {
            fitBoundsDebounceRef.current = null;
            try {
              const valid = previewPath.filter(
                (c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]),
              );
              if (valid.length < 2) return;
              const bounds = valid.reduce(
                (b, [lng, lat]) => [
                  Math.min(b[0], lng), Math.min(b[1], lat),
                  Math.max(b[2], lng), Math.max(b[3], lat),
                ],
                [valid[0][0], valid[0][1], valid[0][0], valid[0][1]],
              );
              console.log('[Cam] preview-fitBounds (debounced):', focusedRoute.name);
              m.fitBounds(bounds as [number, number, number, number], {
                padding: { top: 120, bottom: 280, left: 60, right: 60 },
                maxZoom: 16,
                duration: 600,
              });
            } catch { /* ignore */ }
          }, 600);
        }
        return;
      }

      const navRoutes = routes.filter((r) => r.id.startsWith('nav-') && r.path?.length > 1);
      if (navRoutes.length >= 2) {
        const allCoords = navRoutes
          .flatMap((r) => r.path)
          .filter((c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));
        if (allCoords.length >= 2) {
          try {
            const bounds = allCoords.reduce(
              ([minLng, minLat, maxLng, maxLat], [lng, lat]) => [
                Math.min(minLng, lng), Math.min(minLat, lat),
                Math.max(maxLng, lng), Math.max(maxLat, lat),
              ],
              [Infinity, Infinity, -Infinity, -Infinity],
            );
            console.log('[Cam] preview-fitBounds nav-variants');
            m.fitBounds(bounds as [number, number, number, number], {
              padding: { top: 80, bottom: 200, left: 80, right: 80 },
              duration: 1000,
            });
            return;
          } catch { /* ignore */ }
        }
      }

      if (
        isFiniteLatLng(destinationMarker) &&
        !focusedRoute &&
        !isActiveWorkout &&
        !isNavigationMode
      ) {
        console.log('[Cam] flyTo destination');
        try {
          m.flyTo({
            center: [destinationMarker.lng, destinationMarker.lat],
            zoom: 15, pitch: 0,
            essential: true, duration: 2000,
          });
          return;
        } catch (err) {
          console.error('[Cam] destination flyTo threw — ignored.', err);
        }
      }

      // Initial zoom — flat overview, NO angle. Uses isFiniteLatLng so a
      // GPS sample of `{lat: NaN, lng: NaN}` (desktop / pre-fix) is
      // rejected before reaching Mapbox.
      if (
        !skipInitialZoom &&
        !hasInitialZoomed.current &&
        isFiniteLatLng(currentLocation) &&
        !focusedRoute &&
        !isActiveWorkout &&
        !destinationMarker
      ) {
        hasInitialZoomed.current = true;
        console.log('[Cam] initial-zoom (flat)');
        try {
          m.flyTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: 15, pitch: 0,
            duration: 2000, essential: true,
          });
        } catch (err) {
          console.error('[Cam] initial-zoom flyTo threw — ignored.', err);
        }
      }
      }
    }; // end executeFollowAndPreview

    // Fix 2: during active workout or navigation, collapse rapid successive effect
    // runs (caused by isActiveWorkout + isNavigationMode + mapMode all changing at
    // workout start) into a single camera call by debouncing 200 ms.
    // Preview/discover mode runs immediately for snappy feel.
    if (isActiveWorkout || isNavigationMode) {
      clearTimeout(cameraDebounceRef.current ?? undefined);
      cameraDebounceRef.current = setTimeout(executeFollowAndPreview, 200);
    } else {
      executeFollowAndPreview();
    }
  }, [
    isMapLoaded, currentLocation,
    isNavigationMode, isActiveWorkout, simulationActive,
    focusedRoute, routes, destinationMarker,
    skipInitialZoom, isAutoFollowEnabled,
    wazePadding, mapRef,
    mapMode,
    // sessionStatus drives the STOPPED camera state (paused workout → flatten).
    sessionStatus,
    // recenterTick: bumps when the idle-recenter timer fires OR when
    // recenter() is called manually. Listed here so the effect re-runs
    // and dispatches a follow-mode easeTo even when no other dep changed
    // (e.g. stationary runner whose GPS samples have stopped flowing).
    recenterTick,
  ]);

  // ── onMapReady: wire interaction listeners ──
  const onMapReady = useCallback((rawMap: mapboxgl.Map) => {
    rawMapRef.current = rawMap;

    const breakFollow = () => {
      if (ownerRef.current !== 'user') {
        // Kill any in-flight camera animation to prevent "jump back"
        try { rawMap.stop(); } catch { /* ignore */ }

        // During an active workout/nav, ease the camera to flat north-up so the
        // user sees a normal map view (not the 45° tilted follow perspective).
        if (isActiveWorkoutRef.current || isNavigationModeRef.current) {
          try {
            rawMap.easeTo({ pitch: 0, bearing: 0, duration: 300, essential: true });
          } catch { /* ignore */ }
        }

        ownerRef.current = 'user';
        onUserPanDetectedRef.current?.();
      }
      // Always (re)schedule the idle-recenter timer on a pan/wheel/touch,
      // even if owner was already 'user'. A second touch within the
      // 15 s window means the runner is still actively interacting —
      // we want to extend the grace period, not fire mid-interaction.
      scheduleIdleRecenter();
    };

    const container = rawMap.getCanvasContainer();
    container.addEventListener('mousedown', breakFollow, { passive: true });
    container.addEventListener('wheel', breakFollow, { passive: true });
    container.addEventListener('touchstart', breakFollow, { passive: true });

    const canvas = rawMap.getCanvas();
    canvas.addEventListener('mousedown', breakFollow, { passive: true });
    canvas.addEventListener('wheel', breakFollow, { passive: true });

    rawMap.on('movestart', (evt: any) => {
      if (evt.originalEvent) breakFollow();
    });

    console.log('[Cam] listeners wired');
  }, []);

  const recenter = useCallback(() => {
    // Cancel any pending auto-recenter — the user just did it manually
    // and we don't want a second timer-driven easeTo firing 15 s later
    // on top of whatever they're doing now.
    if (idleRecenterTimerRef.current) {
      clearTimeout(idleRecenterTimerRef.current);
      idleRecenterTimerRef.current = null;
    }
    ownerRef.current = 'follow';
    // Force the camera effect to re-run immediately (manual taps shouldn't
    // wait for the next GPS sample to land before the camera moves).
    setRecenterTick((t) => t + 1);
  }, []);

  return { onMapReady, recenter, owner: ownerRef.current };
}
