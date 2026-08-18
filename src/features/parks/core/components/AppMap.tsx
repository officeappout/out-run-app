'use client';

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import Map, { Source, Layer, Marker, MapRef } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Droplet, Dumbbell, Flag } from 'lucide-react';
import { Route } from '../types/route.types';
import { fetchRealParks } from '../services/parks.service';
import { useMapStore, LayerType, PartnerActivityFilter } from '../store/useMapStore';
import { useFacilities } from '../hooks/useFacilities';
import { useCameraController } from '../hooks/useCameraController';
import { useWalkToRoute } from '../hooks/useWalkToRoute';
import { useMapPerfMonitor } from '../hooks/useMapPerfMonitor';
import { useAdaptiveShed } from '../hooks/useAdaptiveShed';
import { IS_ADAPTIVE_SHED_ENABLED } from '@/config/feature-flags';
import { Popup } from 'react-map-gl';
import LemurMarker from '@/components/LemurMarker';
import PartnerMarker from './PartnerMarker';
import ParkPhotoMarker from './ParkPhotoMarker';
import DestinationMarker from './DestinationMarker';

import { registerPinImage, registerArrowTipImage, registerArrowImage, drawPullUpBarIcon, drawDumbbellIcon, drawDotIcon, MINOR_URBAN_TYPES } from './mapPinIcons';
import { applyFitnessMapStyle, resetFitnessMapStyle } from './mapStyleConfig';
import { IS_PERF_BATCH1_ENABLED } from '@/config/feature-flags';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { segmentPathByZone, bearingBetween, buildLaneOffsetPath, buildDirectionMarkers, isOutAndBackPath, pathLengthMeters, isSameCoord } from '../services/geoUtils';
import type { RouteTurn } from '../services/geoUtils';
import {
  isFiniteNum,
  isFiniteLngLat,
  // Object-shape `{ lat, lng }` guard. Distinct from `isFiniteLngLat`
  // (which validates the `[lng, lat]` tuple shape). The codebase carries
  // both shapes — Marker placement props, Firestore park documents, GPS
  // samples — so we need both validators. See `geoValidation.ts` for the
  // rationale on keeping them separate.
  isFiniteLatLng,
  isFiniteBounds,
  safeNumber,
} from '@/utils/geoValidation';
import {
  ROUTES_BACKGROUND, ROUTES_ACTIVE_GLOW, ROUTES_ACTIVE_OUTLINE, ROUTES_ACTIVE,
  GHOST_PATH_GLOW, GHOST_PATH_LINE, TRACE_PATH_LINE,
  TRAIL_FADE_LINE, ROUTE_PASSED_LINE, ROUTE_DEVIATION_LINE,
  PARK_CLUSTERS_GLOW, PARK_CLUSTERS, PARK_PINS, PARK_MINOR_PINS, PARK_CLUSTER_COUNT,
} from './mapLayersConfig';
import { HYBRID_AER, HYBRID_STR, buildHybridRouteGradient } from './hybrid/hybrid-colors';
// Store read for the off-route flag only — same cross-read precedent as
// useWorkoutSession.ts. Subscribing to the boolean means AppMap re-renders
// on off-route flips, not on every GPS sample.
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';

if (typeof window !== 'undefined') {
  // Reduce Mapbox worker threads from 2 → 1 on iOS WKWebView.
  // Each worker holds its own copy of the tile-decoding pipeline and
  // associated JS heap. On memory-constrained WKWebView processes
  // (~300-500 MB budget) the second worker regularly triggers the
  // WebContent OOM kill, especially while loading route GeoJSON or
  // partner presence data simultaneously. One worker is still enough
  // for real-time 60 fps rendering.
  mapboxgl.workerCount = 1;

  if (!mapboxgl.getRTLTextPluginStatus()) {
    try {
      mapboxgl.setRTLTextPlugin(
        'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
        (error) => { if (error) console.error('RTL Error:', error); },
        true
      );
    } catch (err) { }
  }
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ── Session-scoped "skeleton already shown" gate ─────────────────────────
// Module-level (NOT React state) on purpose — survives across React
// remounts within a single JS session. Gates the AI-themed loading
// skeleton so it only appears on COLD START (first AppMap mount in this
// tab/session). Switching tabs (e.g. /map → /home → /map) re-mounts
// AppMap but reuses the already-initialised Mapbox runtime + cached
// tiles, so re-showing the skeleton would be visual noise.
//
// Reset semantics:
//   • Hard browser reload    — module re-evaluates → flag resets to false → cold start.
//   • Tab close + reopen     — same as above.
//   • Soft client navigation — flag persists → no skeleton on map re-entry.
//
// If a future feature ever forces a style swap (`map.setStyle(...)`),
// flip this back to `false` immediately before the swap so the
// skeleton re-arms for the next mount. There is no current code path
// that does this.
let mapHasInitializedInSession = false;

// ── Direction-marker zoom-dependent visibility (15.08.2026 arrow refinements) ──
// Direction markers should read as a close-up detail, not clutter the
// whole-route overview (the zoom level fitBounds lands on when a route
// first appears). Hidden below DIRECTION_ARROW_MIN_ZOOM, fully visible at
// DIRECTION_ARROW_MIN_ZOOM + DIRECTION_ARROW_FADE_ZOOM_RANGE — a smooth
// opacity ramp (not a hard minzoom cutoff) so they fade in rather than pop.
// Route line and the start/finish marker are untouched by this — they're
// separate layers with their own fixed opacity, visible at every zoom.
// Tune on-device: bump DIRECTION_ARROW_MIN_ZOOM up if arrows still show at
// an overview-ish zoom, down if they take too long to appear while zooming in.
const DIRECTION_ARROW_MIN_ZOOM = 15;
const DIRECTION_ARROW_FADE_ZOOM_RANGE = 0.75;

// ── Pure GeoJSON builder for the live-path trace (module-level = no closure) ──
// Extracted from the previous livePathGeoJSON useMemo so it can be called
// both from the imperative setData effect (Phase 1-B) and from the initial
// Source data prop without allocating a React closure object each time.
function buildLivePathGeoJSON(
  path: [number, number][],
  zones?: (string | null)[] | null,
): GeoJSON.FeatureCollection {
  if (!path || path.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  const hasZones = zones && zones.some((z) => z != null);
  if (!hasZones) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { zoneType: '_default' },
        geometry: { type: 'LineString', coordinates: path },
      }],
    };
  }
  return segmentPathByZone(path, zones!);
}

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// All coordinate-finiteness rules live in `src/utils/geoValidation.ts`
// so AppMap, TurnCarousel, and any future map consumer apply the same
// rule. See that file for the rationale ("LngLat invalid: NaN, NaN").

// ── Live partner presence — zoom-tiered Mapbox layers ──
// The same `partner-presence` GeoJSON source feeds both layers; each layer's
// zoom range and opacity ramp ensures only one tier is visible at any zoom:
//   zoom <  13  → heatmap (yellow → orange → red)
//   zoom 13–14  → small teal dots
//   zoom >= 15  → React <Marker> with full PartnerMarker (handled in JSX, not here)
const PRESENCE_HEATMAP_LAYER: mapboxgl.HeatmapLayer = {
  id: 'presence-heatmap',
  type: 'heatmap',
  source: 'partner-presence',
  maxzoom: 13,
  paint: {
    'heatmap-weight': 1,
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 12, 1.5],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(0,0,0,0)',
      0.2, 'rgba(255,220,0,0.4)',
      0.5, 'rgba(255,140,0,0.65)',
      0.8, 'rgba(255,60,0,0.85)',
      1,   'rgba(200,0,0,1)',
    ],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 12, 35],
    // Fade out across zoom 11-13 so the dots layer can take over cleanly.
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.85, 13, 0],
  },
};

const PRESENCE_DOTS_LAYER: mapboxgl.CircleLayer = {
  id: 'presence-dots',
  type: 'circle',
  source: 'partner-presence',
  minzoom: 13,
  maxzoom: 15,
  paint: {
    'circle-radius': 5,
    'circle-color': '#00ADEF',
    // Fade in at zoom 13, hold through 14.5, fade back out by 15 where
    // the React <Marker> tier takes over with full PartnerMarker visuals.
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, 0.85, 14.5, 0.85, 15, 0],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#ffffff',
  },
};

interface AppMapProps {
  routes?: Route[];
  currentLocation?: { lat: number; lng: number } | null;
  focusedRoute?: Route | null;
  selectedRoute?: Route | null;
  onRouteSelect?: (route: Route) => void;
  livePath?: [number, number][];
  livePathZones?: (string | null)[];
  isActiveWorkout?: boolean;
  destinationMarker?: { lat: number; lng: number } | null;
  /** Every hybrid stop's marker (Part 5) — the real park photo-pin per stop when the park
   *  has one, else the cyan fallback icon, at station size. One per resolved stop. */
  hybridStations?: { lat: number; lng: number; name?: string; image?: string }[] | null;
  /** Free-run leg-plan stops (ג' Phase 3, 08.08) — numbered purple pins so the
   *  user can see their composed plan on the map while building it. Deliberately
   *  a distinct color/shape from hybridStations above (not the same feature). */
  legPlanStops?: { id: string; lat: number; lng: number; label?: string }[] | null;
  /** Bumped by a recenter tap → ease the camera to `currentLocation` (best-available fix). */
  recenterSignal?: number;
  isNavigationMode?: boolean;
  userBearing?: number;
  isAdmin?: boolean;
  onMapRef?: (ref: MapRef) => void;
  skipInitialZoom?: boolean;
  isAutoFollowEnabled?: boolean;
  onUserPanDetected?: () => void;
  onLongPress?: (pos: { lat: number; lng: number }) => void;
  /** When true, easeTo duration drops to 80 ms to match 100 ms sim ticks — eliminates jitter */
  simulationActive?: boolean;
  /** Current speed in km/h — drives dynamic zoom/pitch adaptation */
  speedKmH?: number;
  /** Live partner positions rendered as PartnerMarker on the map */
  partnerPositions?: { uid: string; name: string; lat: number; lng: number; color: string; activityStatus?: string; personaImageUrl?: string; lemurStage?: number }[];
  /**
   * Active partner-activity filter from useMapStore. Controls which partner
   * markers stay visible: 'all' shows every partner; 'strength' includes
   * both 'strength' and 'workout' statuses; 'running' / 'walking' match
   * exactly. Ignored when `liveUsersVisible` is false.
   */
  partnerActivityFilter?: PartnerActivityFilter;
  /**
   * Master visibility toggle for live partner markers. When false, NO
   * partner pins are drawn regardless of `partnerActivityFilter`. Default
   * `false` keeps the base map clean for users who never open the partner
   * finder.
   */
  liveUsersVisible?: boolean;
  /** Current user's persona ID — determines which lemur character image to show */
  userPersonaId?: string | null;
  /** Callback when a partner marker is tapped */
  onPartnerClick?: (partner: { uid: string; name: string; personaImageUrl?: string; lemurStage?: number }) => void;
  /** Neighborhood-level anchor coordinates to use as initial map center (zoom 14). Falls back to Tel Aviv. */
  initialCenter?: { lat: number; lng: number } | null;
  /**
   * True only when `initialCenter` came from the user's own last real GPS
   * fix (not a coarser anchor tier), of ANY age — deliberately age-agnostic
   * (round 7, 18.08.2026: see `isSeedFresh` below for the age-gated
   * counterpart). When true, the loading skeleton reveals as soon as the
   * map paints instead of also waiting on a fresh GPS fix — a stale-but-
   * present seed is still a perfectly good place for the initial dive to
   * start from, since it always corrects (round 6) rather than assuming a
   * no-op. Default false preserves the original wait-for-GPS behavior for
   * every other seed tier (round 4 mobile map fix, 18.08.2026 — see
   * MapShell.tsx's initialMapCenter).
   */
  hasAccurateLocationSeed?: boolean;
  /**
   * True only when `initialCenter` is BOTH the accurate GPS-tier seed
   * (`hasAccurateLocationSeed`) AND recent enough (MapShell's
   * GPS_SEED_STALENESS_THRESHOLD_MS against the fix's own `last_gps_at`
   * timestamp) to trust as "the user is plausibly still here." Deliberately
   * a SEPARATE flag from `hasAccurateLocationSeed`, not folded into it —
   * the camera (via `hasAccurateLocationSeed`/`initialCenter`) intentionally
   * stays age-agnostic (round 6: a stale seed is still fine to dive FROM,
   * since the dive+retarget mechanism corrects it regardless), but showing
   * the user's own location marker at a position is a factual claim, not
   * just an animation starting point — it needs the stricter, age-gated
   * bar. Only consumed by the location marker's seed fallback (round 7,
   * 18.08.2026).
   */
  isSeedFresh?: boolean;
  /** Current map mode — forwarded to the camera controller so it can run a
   * one-shot fit-all on first entry into discover mode. */
  mapMode?: string;
  /**
   * Active navigation turns. When provided, renders a ground arrow at each
   * maneuver point (3D, ground-plane-aligned) and a billboard street-name
   * bubble. Drives the camera controller's proximity-based pitch / zoom
   * transitions. Pass null / undefined when no guided route is active.
   */
  navigationTurns?: RouteTurn[] | null;
  /**
   * User's selected activity. Drives the "Game Mode" park rendering:
   *   • 'walking' + zoom ≥ 14 → ParkPhotoMarker (photo bubble + tail)
   *   • 'running' / 'cycling' → existing SymbolLayer vector pins
   * Falls through to vector pins when undefined so non-mode-aware callers
   * keep their current behaviour.
   */
  activityType?: 'walking' | 'running' | 'cycling' | string;
}

// Window for the presence-heatmap setData throttle (Stage 1b). Each
// verified_global presence snapshot rebuilds presenceGeoJSON → react-map-gl
// setData → Mapbox re-tessellates the WHOLE heatmap; in a dense city snapshots
// arrive many times a second, so the map never settles = sustained GPU heat.
// Start low so the ambient tier still tracks reality closely; raise if needed.
const PRESENCE_SETDATA_THROTTLE_MS = 750;

// Trailing+leading throttle for a value — mirrors the setTimeout-ref debounce
// idiom in useCameraController.ts. Emits the first value immediately, then at
// most once per `delayMs`; the newest value within a window fires on the
// trailing edge. Quiet when `value`'s reference is stable (memoised). Timer
// cleared on unmount.
function useThrottledValue<T>(value: T, delayMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastEmitRef = useRef(0);
  const latestRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestRef.current = value;

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastEmitRef.current;
    if (elapsed >= delayMs) {
      lastEmitRef.current = now;
      setThrottled(value);
    } else if (!timerRef.current) {
      // A timer already covers the newest value via latestRef, so bursts within
      // the window coalesce into one trailing flush.
      timerRef.current = setTimeout(() => {
        lastEmitRef.current = Date.now();
        timerRef.current = null;
        setThrottled(latestRef.current);
      }, delayMs - elapsed);
    }
  }, [value, delayMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return throttled;
}

export default function AppMap({
  routes = [],
  currentLocation,
  focusedRoute,
  selectedRoute,
  onRouteSelect,
  livePath,
  livePathZones,
  isActiveWorkout,
  destinationMarker,
  hybridStations,
  legPlanStops,
  recenterSignal,
  isNavigationMode = false,
  userBearing = 0,
  isAdmin = false,
  onMapRef,
  skipInitialZoom = false,
  isAutoFollowEnabled = true,
  onUserPanDetected,
  onLongPress,
  simulationActive = false,
  speedKmH = 6,
  partnerPositions = [],
  partnerActivityFilter = 'all',
  liveUsersVisible = false,
  userPersonaId,
  onPartnerClick,
  initialCenter,
  hasAccurateLocationSeed = false,
  isSeedFresh = false,
  mapMode,
  navigationTurns,
  activityType,
}: AppMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Map Performance Monitor (map-watchdog-plan.md §5B) — pure observability,
  // writes useMapStore.pressureLevel from FPS/memoryWarning/webglcontextlost.
  // No behavior change here; see the hook's own doc comment.
  useMapPerfMonitor(mapRef, isMapLoaded);

  // Adaptive Shed (map-watchdog-plan.md §5C) — reacts to pressureLevel by
  // hiding partner markers under sustained critical pressure. No-ops when
  // IS_ADAPTIVE_SHED_ENABLED is false. See the hook's own doc comment.
  useAdaptiveShed();

  // ── Mapbox event-handler refs for unmount disposal ────────────────────────
  // `handleMapLoad` registers three Mapbox listeners (`style.load` x2 +
  // `sourcedata`) via closures local to the callback. Without explicit
  // .off() on unmount the handlers keep a strong reference to the live
  // Mapbox instance and the WebGL context never gets garbage-collected —
  // every nav cycle leaks one zombie map and iOS WKWebView OOM-kills
  // the WebContent process after a few re-entries. We hoist the handler
  // identities to refs here so the cleanup useEffect below can detach
  // them by reference (Mapbox .off() requires exact handler identity).
  const hebrewHandlerRef = useRef<(() => void) | null>(null);
  const debouncedHebrewRef = useRef<(() => void) | null>(null);
  const declutterHandlerRef = useRef<(() => void) | null>(null);
  // Tracks any in-flight hebrewDebounce setTimeout so the cleanup effect
  // can cancel it on unmount. Without this, a sourcedata event that fires
  // 50 ms before unmount schedules the timeout, the .off() cleanup fires
  // (preventing new events), but the already-scheduled callback still runs
  // after unmount holding a reference to the raw Mapbox map instance.
  const hebrewDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Idempotency guard for the Hebrew relabel sweep. Base-map label layers are
  // style-defined, so once their text-field is switched to the Hebrew
  // expression it stays set — re-running the full ~150-layer setLayoutProperty
  // pass on every 'sourcedata' tile event while panning is pure churn. Set true
  // after the first successful pass; a real 'style.load' (setStyle / hot-reload
  // rebuilds the layers) re-arms it. See handleMapLoad.
  const hebrewLabelsAppliedRef = useRef(false);
  // ── Map paint + location readiness gate ─────────────────────────────────
  // Drives the AI-themed `MapLoadingSkeleton` overlay. False until BOTH:
  //   1. Paint: the Mapbox style has finished parsing (so the declutter pass
  //      ran and the noisy POI / transit / minor-road labels are gone) AND
  //      the first `idle`/`render` event has fired.
  //   2. Location: `currentLocation` has resolved (real GPS fix or a
  //      deliberate fallback from useGPS), OR a bounded timeout has elapsed.
  // Combined, this guarantees the skeleton dissolves into a clean, styled,
  // settled, CORRECTLY-CENTERED map — never the raw streets-v12 default with
  // a visible style swap mid-paint, and never the initialViewState
  // anchor/Tel-Aviv fallback with a visible flyTo jump to the real location
  // right after (14.08.2026 fix — see useCameraController's initial-zoom
  // flyTo, which used to run fully in view because paint-readiness alone
  // used to gate the skeleton, decoupled from location-readiness).
  //
  // The lazy initializer reads `mapHasInitializedInSession` (module
  // scope) so warm re-mounts (tab switch back to /map) start with the
  // skeleton already disabled. Cold starts initialise it to `false`,
  // the skeleton renders, and `markReady` below flips both the React
  // state AND the module flag together — so the very next remount in
  // the same session skips the skeleton entirely.
  const [isVisuallyReady, setIsVisuallyReady] = useState(() => mapHasInitializedInSession);
  const [isPaintReady, setIsPaintReady] = useState(() => mapHasInitializedInSession);
  // Bounded so denied/slow GPS doesn't strand the user on the skeleton
  // forever — 3s comfortably covers a typical first-fix while staying
  // "brief" per the product ask; if it elapses, the skeleton clears onto
  // whatever initialViewState already is (today's exact behavior, not a
  // regression), and the flyTo still fires normally once/if a fix lands
  // later. Only reached when `hasAccurateLocationSeed` is false — see below.
  const LOCATION_READY_TIMEOUT_MS = 3000;
  // `hasAccurateLocationSeed` (round 4 mobile map fix, 18.08.2026) skips
  // this wait entirely: real-world cold-GPS latency regularly exceeds the
  // 3s budget above, and once initialCenter is the user's own last real fix
  // (not a coarser anchor), there's nothing left to hide — the later
  // initial-zoom flyTo against that seed is a guaranteed no-op. Waiting for
  // GPS in that case only reintroduces the exact race this is meant to
  // avoid: the skeleton timing out before GPS, revealing-then-correcting in
  // full view.
  const [isLocationReady, setIsLocationReady] = useState(
    () => mapHasInitializedInSession || !!currentLocation || hasAccurateLocationSeed,
  );

  // Publish the splash-gate state to the store so sibling map layers
  // (DiscoverLayer's search / mode chips / FAB / recenter / entry button)
  // hide during the MapLoadingSkeleton and reveal together when the map
  // paints — all reading this ONE flag, no re-detection. `markReady`
  // (Mapbox render/idle or the 900ms safety timeout) stays the only source;
  // this merely mirrors it. Warm re-mounts init isVisuallyReady=true and the
  // store persists true across them, so the controls never re-flash.
  const setMapVisuallyReady = useMapStore((s) => s.setMapVisuallyReady);
  useEffect(() => {
    setMapVisuallyReady(isVisuallyReady);
  }, [isVisuallyReady, setMapVisuallyReady]);

  // Adaptive Shed input (map-watchdog-plan.md §5C) — drives the presence
  // throttle below. Read here (not inside useAdaptiveShed) since it's a pure
  // per-render value pick, not a side effect.
  const pressureLevel = useMapStore((s) => s.pressureLevel);

  const [parks, setParks] = useState<any[]>([]);
  const { setSelectedPark, visibleLayers, selectedPark } = useMapStore();

  // Point 15: when a hybrid route is focused, its strength-station fractions drive a
  // green(walk)→blue(strength)→green line-gradient on the active route line, and the
  // cyan glow is neutralized to green so it doesn't fight the gradient. Null →
  // non-hybrid route → the modality-colored flat paint below.
  const hybridRouteStations = useMapStore((s) => s.hybridRouteStations);
  const isHybridRoute = !!hybridRouteStations && hybridRouteStations.length > 0;
  // 15.08.2026 route-styling batch: non-hybrid focused routes now color by
  // MODALITY instead of a flat cyan — aerobic (walking/running/cycling, the
  // vast majority of routes) gets HYBRID_AER, a 'workout' activityType route
  // (see ParkDetailSheet.tsx) gets HYBRID_STR, matching the hybrid gradient's
  // own two colors so standalone and hybrid strength look identical. Shared
  // with the direction-marker icon choice below (route-direction-arrows).
  const focusedIsStrength = focusedRoute?.activityType === 'workout';
  const focusedModalityColor = focusedIsStrength ? HYBRID_STR : HYBRID_AER;
  const routesActivePaint = useMemo(
    () => (isHybridRoute
      ? { 'line-gradient': buildHybridRouteGradient(hybridRouteStations!), 'line-width': 6, 'line-opacity': 1 }
      : { ...ROUTES_ACTIVE.paint, 'line-color': focusedModalityColor }),
    [isHybridRoute, hybridRouteStations, focusedModalityColor],
  );
  const routesGlowPaint = useMemo(
    () => (isHybridRoute
      ? { ...ROUTES_ACTIVE_GLOW.paint, 'line-color': HYBRID_AER }
      : { ...ROUTES_ACTIVE_GLOW.paint, 'line-color': focusedModalityColor }),
    [isHybridRoute, focusedModalityColor],
  );
  // Selected park id powers the cyan-ring highlight on ParkPhotoMarker so
  // tapping a pin gives instant visual feedback BEFORE the preview sheet
  // animates in. Stored as id (not the whole object) so equality checks
  // stay cheap inside the marker map().
  const selectedParkId = selectedPark?.id ?? null;
  const turnFlyToTarget = useMapStore((s) => s.turnFlyToTarget);
  // Commute destination — drives the floating <DestinationMarker /> below.
  // Set by DiscoverLayer (commute-mode entry) and cleared on commute exit.
  const commuteDestination = useMapStore((s) => s.commuteDestination);
  // Active turn idx published by TurnCarousel. -1 = no selection. Used to
  // filter the ground-arrow GeoJSON to a SINGLE feature so the icon never
  // appears on every turn at once.
  const activeTurnIdx = useMapStore((s) => s.activeTurnIdx);
  // Off-route flag from the running player — drives the dashed deviation
  // connector during an active guided run. Boolean selector: AppMap
  // re-renders on off-route flips only, not on every GPS sample.
  const isOffRoute = useRunningPlayer((s) => s.isOffRoute);

  // Consume TurnCarousel camera requests:
  //   • flyTo     → center the camera on a single turn vertex (peek-one-turn).
  //   • fitBounds → frame the entire upcoming leg between the user and the
  //                 swiped turn so the user can preview the segment they're
  //                 about to traverse, not just the turn corner.
  // Cleared after consumption so re-renders don't replay the animation.
  //
  // ── NUCLEAR NaN guard ──────────────────────────────────────────────────
  // Last line of defence. Mapbox's `fitBounds` / `flyTo` throw a hard
  // exception when fed any non-finite coordinate (`LngLat invalid: NaN,
  // NaN`) which would unmount the entire map tree. We have upstream
  // guards (geoValidation in TurnCarousel + the structural helpers
  // below) but a single regression anywhere in the pipeline used to be
  // enough to crash. The helper + early-returns at the TOP of this
  // effect are deliberately the simplest, dumbest possible check —
  // composed before anything else can run, ZERO branches between the
  // check and the early return. If we ever see a Mapbox crash from
  // turn-flyTo again, this block can be the only thing we need to read.
  useEffect(() => {
    if (!turnFlyToTarget) return;

    // Aggressive nuclear check — runs FIRST, before getMap, before any
    // structural unwrap, before bearing coercion. A bad payload exits
    // here without touching anything mutable.
    const isValid = (coords: unknown): coords is number[] =>
      Array.isArray(coords) && coords.every((c) => Number.isFinite(c));
    if (turnFlyToTarget.kind === 'flyTo' && !isValid(turnFlyToTarget.center)) {
      console.warn(
        '[AppMap] NUCLEAR guard: dropping flyTo with invalid center.',
        turnFlyToTarget.center,
      );
      useMapStore.getState().setTurnFlyToTarget(null);
      return;
    }
    if (
      turnFlyToTarget.kind === 'fitBounds' &&
      (!Array.isArray(turnFlyToTarget.bounds) ||
        turnFlyToTarget.bounds.length !== 2 ||
        !isValid(turnFlyToTarget.bounds[0]) ||
        !isValid(turnFlyToTarget.bounds[1]))
    ) {
      console.warn(
        '[AppMap] NUCLEAR guard: dropping fitBounds with invalid bounds.',
        turnFlyToTarget.bounds,
      );
      useMapStore.getState().setTurnFlyToTarget(null);
      return;
    }

    const rawMap = mapRef.current?.getMap();
    if (!rawMap) return;

    const safeBearing = safeNumber(turnFlyToTarget.bearing, 0);

    // Wrap the actual Mapbox dispatch in try/catch so even if a NaN
    // somehow slips past every guard above (a Mapbox internal cast, a
    // future regression upstream, anything we haven't thought of), the
    // exception stays scoped to this effect — the map keeps its current
    // camera and the rest of the app keeps rendering. Without this
    // try/catch, any Mapbox crash here unmounts the entire map tree.
    try {
      if (turnFlyToTarget.kind === 'fitBounds') {
        // Defence-in-depth: structural helper (shape + finiteness in
        // one call). Already covered by the nuclear guard above; the
        // explicit re-check protects against a TS-only cast bypass and
        // keeps the type narrowed for the .fitBounds call.
        if (!isFiniteBounds(turnFlyToTarget.bounds)) {
          console.warn('[AppMap] FINAL guard: fitBounds rejected — bounds non-finite.', turnFlyToTarget.bounds);
          useMapStore.getState().setTurnFlyToTarget(null);
          return;
        }
        // Last-mile inline check on the FOUR raw scalars Mapbox will
        // actually consume. If we reach this line and any of these is
        // NaN, the nuclear+structural guards both regressed — log
        // loudly so the bug is impossible to miss.
        const [[swLng, swLat], [neLng, neLat]] = turnFlyToTarget.bounds;
        if (
          !Number.isFinite(swLng) || !Number.isFinite(swLat) ||
          !Number.isFinite(neLng) || !Number.isFinite(neLat)
        ) {
          console.error('[AppMap] CRITICAL: bounds passed every guard but contain NaN. Aborting.', { swLng, swLat, neLng, neLat });
          useMapStore.getState().setTurnFlyToTarget(null);
          return;
        }
        // Padding leaves enough room for the carousel banner up top
        // and the metrics card / control bar down bottom — without it
        // Mapbox would happily zoom the leg under the UI chrome.
        //
        // Canvas-aware clamp: if the map canvas is small (mobile in
        // landscape, dev preview at non-standard sizes, embedded view)
        // a 140 + 320 vertical budget can EXCEED the available height,
        // making Mapbox's internal projection math divide by a
        // negative number → silent NaN → "LngLat invalid: NaN, NaN"
        // even though OUR `bounds` passed every guard above. Cap each
        // axis at 35 % of the corresponding canvas dimension; the
        // visual result is still the correct framing on any device.
        const canvas = rawMap.getCanvas();
        const cw = canvas?.clientWidth ?? 0;
        const ch = canvas?.clientHeight ?? 0;
        const fitPadding = {
          top:    Math.min(140, ch > 0 ? Math.floor(ch * 0.35) : 140),
          bottom: Math.min(320, ch > 0 ? Math.floor(ch * 0.35) : 320),
          left:   Math.min(60,  cw > 0 ? Math.floor(cw * 0.20) : 60),
          right:  Math.min(60,  cw > 0 ? Math.floor(cw * 0.20) : 60),
        };
        rawMap.fitBounds(turnFlyToTarget.bounds, {
          padding: fitPadding,
          bearing: safeBearing,
          // Match the immersive "approaching turn" camera state so the
          // swipe-preview lands at the same pitch the auto-camera would
          // use if the runner were physically near this turn (75°).
          pitch: 75,
          duration: 800,
          maxZoom: 18.5,
        });
      } else {
        if (!isFiniteLngLat(turnFlyToTarget.center)) {
          console.warn('[AppMap] FINAL guard: flyTo rejected — center non-finite.', turnFlyToTarget.center);
          useMapStore.getState().setTurnFlyToTarget(null);
          return;
        }
        const [lng, lat] = turnFlyToTarget.center;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          console.error('[AppMap] CRITICAL: center passed every guard but contains NaN. Aborting.', { lng, lat });
          useMapStore.getState().setTurnFlyToTarget(null);
          return;
        }
        rawMap.flyTo({
          center: turnFlyToTarget.center,
          bearing: safeBearing,
          // Carousel-camera link: swipe to a turn → camera dives in at
          // the same zoom/pitch the auto-camera uses when the runner is
          // approaching a maneuver. Eliminates the visual mismatch
          // between user-driven and GPS-driven turn previews.
          zoom: 18.5,
          pitch: 75,
          duration: 800,
        });
      }
    } catch (err) {
      // Mapbox raised — most commonly "LngLat invalid: NaN, NaN".
      // Swallow so the error doesn't unmount the React tree. The
      // user sees the map frozen at its current camera; the next
      // valid GPS sample restarts the camera flow naturally.
      console.error('[AppMap] Mapbox camera call threw — UI preserved, target dropped.', err);
    }
    useMapStore.getState().setTurnFlyToTarget(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnFlyToTarget]);
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);
  const [currentZoom, setCurrentZoom] = useState(13);
  // Viewport-scoped facility fetch (refetches as the user pans out of the loaded
  // box) — see useFacilities. Passed currentZoom so it only fetches at the zoom
  // where facility markers actually render (>= 14).
  const { facilities } = useFacilities(currentZoom);
  // Min zoom delta worth a re-render. `currentZoom` is only ever read as a
  // discrete breakpoint (>=10/13/14/15 — lemur scale, pulse dot, facilities,
  // partners, park photo), never as a continuous value, so committing the
  // per-frame onZoom value re-renders the whole map tree ~60x/sec for nothing.
  // 0.25 is well below the 1.0 spacing of those integer breakpoints, so no
  // crossing is missed; onZoomEnd still commits the exact value at rest.
  const ZOOM_COMMIT_EPSILON = 0.25;
  const [viewportBounds, setViewportBounds] = useState<mapboxgl.LngLatBounds | null>(null);
  const [showInfrastructure, setShowInfrastructure] = useState(false);

  // ── Walk-to-route dotted path (discover mode only) ──
  // Must be before useCameraController so targetEndpoint is available for the bearing.
  const walkToRoute = useWalkToRoute(
    currentLocation ?? null,
    focusedRoute ?? null,
    !!isActiveWorkout,
    mapMode,
  );

  // ── Unified camera controller — single owner, single effect ──
  const camera = useCameraController({
    mapRef,
    isMapLoaded,
    currentLocation: currentLocation ?? null,
    userBearing,
    speedKmH,
    isNavigationMode,
    isActiveWorkout: !!isActiveWorkout,
    simulationActive,
    focusedRoute: focusedRoute ?? null,
    routes,
    destinationMarker: destinationMarker ?? null,
    skipInitialZoom,
    isAutoFollowEnabled,
    onUserPanDetected,
    mapMode,
    walkToRouteTarget: walkToRoute.targetEndpoint ?? null,
    navigationTurns: navigationTurns ?? null,
  });

  // Recenter tap (from the layers) → ease straight to the best-available fix. In
  // discover mode the follow effect fits ROUTES, so a plain recenter never centered
  // "me"; this direct call does, using currentLocation (live GPS or fallback dot).
  const prevRecenterSignal = useRef(recenterSignal);
  useEffect(() => {
    if (recenterSignal == null || recenterSignal === prevRecenterSignal.current) return;
    prevRecenterSignal.current = recenterSignal;
    camera.centerOnUser(currentLocation ?? null);
  }, [recenterSignal, camera, currentLocation]);

  const visibleRoutes = useMemo(() => {
    return routes.filter((r) => {
      // In admin mode: raw infrastructure segments respect the admin toggle
      if (isAdmin && r.isInfrastructure) return showInfrastructure;
      // In user mode: all routes that arrived via useRouteGeneration are eligible to draw
      return true;
    });
  }, [routes, isAdmin, showInfrastructure]);

  // ── Activity-filtered positions ──
  // Applies the `partnerActivityFilter` (synced live from
  // `usePartnerFilters.liveActivity` via DiscoverLayer) WITHOUT the
  // `liveUsersVisible` gate. This is the shared source for both:
  //   • The always-on heatmap + dots (which should thin out when the user
  //     filters by an activity, regardless of whether the partner-finder
  //     UI is open).
  //   • The `visiblePartners` array used for full <Marker> rendering,
  //     which adds `liveUsersVisible` on top.
  // The 'strength' bucket includes both 'strength' and 'workout' statuses
  // since both surface as strength training in the partner overlay.
  const activityFilteredPositions = useMemo(() => {
    if (partnerActivityFilter === 'all') return partnerPositions;
    return partnerPositions.filter((p) => {
      const status = p.activityStatus ?? '';
      if (partnerActivityFilter === 'strength') {
        return status === 'strength' || status === 'workout';
      }
      if (partnerActivityFilter === 'running') return status === 'running';
      if (partnerActivityFilter === 'walking') return status === 'walking';
      return false;
    });
  }, [partnerPositions, partnerActivityFilter]);

  // ── Visible partner pins (full markers, zoom 15+) ──
  // Layers the master `liveUsersVisible` switch on top of the
  // activity-filtered set. False ⇒ no React <Marker> rendered.
  const visiblePartners = useMemo(() => {
    if (!liveUsersVisible) return [];
    return activityFilteredPositions;
  }, [activityFilteredPositions, liveUsersVisible]);

  // ── Presence GeoJSON sources ──
  // Two FeatureCollections drive the zoom-tier rendering:
  //  • presenceGeoJSON         — activity-filtered, ALWAYS-ON. Powers the
  //                              heatmap + dots so the ambient density
  //                              indicator thins out as the user filters
  //                              but stays visible when the partner-finder
  //                              UI is closed.
  //  • visiblePartnersGeoJSON  — fully filtered (activity + visibility);
  //                              reserved for future clustered marker
  //                              source. Current marker rendering still
  //                              uses the `visiblePartners` array directly.
  const presenceGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: activityFilteredPositions
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { uid: p.uid },
      })),
  }), [activityFilteredPositions]);

  // Stage 1b: throttle ONLY the heatmap/dots Source data (the expensive Mapbox
  // re-tessellation). The live <Marker> pins below use the un-throttled
  // `visiblePartners`, so zoom-15 pins stay responsive.
  //
  // Adaptive Shed (§5C): under pressure, slacken the throttle further —
  // invisible to the user (still just paint cadence), just less GC/compositor
  // churn. No-ops to the flat 750ms baseline when IS_ADAPTIVE_SHED_ENABLED is
  // false, or when pressureLevel is 'normal'.
  const presenceThrottleMs = IS_ADAPTIVE_SHED_ENABLED
    ? (pressureLevel === 'critical' ? 2000 : pressureLevel === 'warning' ? 1500 : PRESENCE_SETDATA_THROTTLE_MS)
    : PRESENCE_SETDATA_THROTTLE_MS;
  const throttledPresenceGeoJSON = useThrottledValue(presenceGeoJSON, presenceThrottleMs);

  const visiblePartnersGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: visiblePartners
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { uid: p.uid },
      })),
  }), [visiblePartners]);

  // Abort-aware park fetch. `fetchRealParks` resolves with the inventory
  // list and we cache it in local state. On a slow network, a tab-switch
  // mid-fetch used to leave the unresolved Promise pinning this component
  // instance until the network completed — at which point setParks fired
  // against a torn-down fiber, blocking GC of the entire AppMap tree and
  // (combined with the Mapbox listener leaks) accelerating the iOS OOM
  // kill. The signal-guarded then() drops the state update for stale
  // mounts so the fiber can be reclaimed immediately on unmount.
  // `fetchRealParks` itself doesn't accept a signal (it's a Firestore
  // getDocs wrapper) so the abort only prevents the post-resolution
  // setState — the underlying network request is left to complete.
  useEffect(() => {
    const controller = new AbortController();
    // fetchRealParks implements stale-while-revalidate: the Promise resolves
    // with cached data instantly (0 ms on warm sessions) so pins appear before
    // the first Firestore round-trip. The onRefresh callback fires when the
    // background sync completes and applies a smooth state update without
    // blocking the initial render or creating layout jank.
    fetchRealParks((fresh) => {
      if (!controller.signal.aborted) setParks(fresh);
    })
      .then((data) => {
        if (!controller.signal.aborted) setParks(data);
      })
      .catch(() => { /* swallowed — non-fatal for map render */ });
    return () => controller.abort();
  }, []);

  // ── "Destination Highlight" park photo pin gating ─────────────────────
  // Earlier iteration mounted a photo bubble for EVERY park in walking
  // mode, which blew through Mapbox's WebGL marker buffer once a city's
  // worth of parks entered the viewport (each <Marker> child is a DOM
  // node + image decode). Lesson: photo bubbles are an attention asset,
  // not a density asset.
  //
  // New rule: ONE photo bubble at a time. The selected park "pops" out
  // of its vector pin into a richer photo bubble — that becomes the
  // destination-highlight visual. Every other park keeps its
  // SymbolLayer vector pin so the map reads as a clean, fast field of
  // points. Works for all activity types; walking just so happens to be
  // where users dwell long enough to enjoy the highlight.
  const showSelectedParkPhoto = currentZoom >= 13 && !!selectedPark;

  // Cache the resolved selected park's photo URL & coordinates as a
  // single derived object. Validating coords here means the JSX render
  // stays simple (no second null-check) and we can short-circuit when
  // the park record is malformed (older inventory entries).
  const selectedParkPhotoData = useMemo(() => {
    if (!selectedPark) return null;
    const lat = Number(selectedPark.location?.lat);
    const lng = Number(selectedPark.location?.lng);
    if (!isFiniteLngLat([lng, lat])) return null;
    const photoUrl: string | null =
      selectedPark.imageUrl ||
      selectedPark.image ||
      (Array.isArray(selectedPark.images) ? selectedPark.images[0] : null) ||
      null;
    return {
      id: selectedPark.id,
      name: selectedPark.name || '',
      lat,
      lng,
      photoUrl,
    };
  }, [selectedPark]);

  // ── Memoized "skip selected park" filter for the park-pins Layer ──
  // PARK_PINS.filter is `['all', ...clauses]`. We slice off the leading
  // 'all' literal before spreading so the result is `['all', ...clauses,
  // ['!=', ['get', 'id'], selectedParkId]]` — Mapbox rejects a doubled
  // 'all'. Memoised on `selectedParkId` ONLY so the layer's filter prop
  // keeps the same reference between unrelated re-renders (GPS ticks,
  // zoom change, parks list refresh). Without this memo, react-map-gl's
  // shallow diff sees a new filter array every frame and re-issues
  // `setFilter` against the GL layer — measurable buffer churn.
  const parkPinsFilter = useMemo(() => {
    if (!selectedParkId) return PARK_PINS.filter as any;
    return [
      'all',
      ...((PARK_PINS.filter as unknown as any[]).slice(1)),
      ['!=', ['get', 'id'], selectedParkId],
    ] as any;
  }, [selectedParkId]);

  // ── Parks GeoJSON with clustering properties ──
  const parksGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: parks
      .filter(p => p.location?.lat && p.location?.lng)
      .map(park => ({
        type: 'Feature' as const,
        properties: {
          id: park.id,
          name: park.name || '',
          isFunctional: park.isFunctional === true,
          facilityType: park.facilityType || 'gym_park',
          isMinor: MINOR_URBAN_TYPES.includes(park.urbanType || ''),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [Number(park.location.lng), Number(park.location.lat)],
        },
      })),
  }), [parks]);

  // ── Forced declutter watchdog ──────────────────────────────────────────
  // Belt-and-braces: in addition to the on('style.load') listener registered
  // inside handleMapLoad, this effect watches the React `isMapLoaded` flag
  // and forces an applyFitnessMapStyle call the moment the style reports
  // ready. If the style is still parsing, a 250 ms poll retries until
  // isStyleLoaded() returns true (max 20 attempts = 5 s safety cap).
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const tryApply = () => {
      if (map.isStyleLoaded()) {
        applyFitnessMapStyle(map, 'watchdog');
        return true;
      }
      return false;
    };

    if (tryApply()) return;

    const intervalId = setInterval(() => {
      attempts++;
      if (tryApply() || attempts >= MAX_ATTEMPTS) {
        clearInterval(intervalId);
      }
    }, 250);

    // One-shot idle safety net — fires once the very first time tiles +
    // layout settle, then auto-detaches. Using `once` (not `on`) avoids
    // re-running the declutter on every pan/zoom which would tank perf.
    const onIdle = () => applyFitnessMapStyle(map, 'idle-safety');
    map.once('idle', onIdle);

    return () => {
      clearInterval(intervalId);
      try { map.off('idle', onIdle); } catch { /* map may be gone */ }
    };
  }, [isMapLoaded]);

  // ── Skeleton dissolve trigger: paint readiness ──────────────────────────
  // Flips `isPaintReady` true on the first Mapbox `idle` event after
  // the style has loaded. By that point the declutter pass has already
  // mutated the style (style.load fires before the first idle), tiles
  // for the viewport are painted, and any in-flight camera animation
  // has settled — so the skeleton's exit dissolve reveals a clean,
  // final-state map instead of a half-rendered one.
  //
  // The 5 s timeout is a safety net that matches the watchdog's max
  // attempts (20 × 250 ms). If a tile download stalls, the skeleton
  // still clears so the user isn't stuck staring at the AI animation
  // forever; they'll see whatever the map managed to render.
  //
  // Short-circuits entirely on warm mounts (already-initialised
  // session) — see the `mapHasInitializedInSession` comment up top.
  // Note (14.08.2026): this only marks paint-readiness now — the actual
  // skeleton-dissolve gate is `isVisuallyReady`, combined below from BOTH
  // this AND location-readiness.
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    if (mapHasInitializedInSession) return; // warm mount — skeleton stays hidden, no listener needed
    const map = mapRef.current.getMap();
    if (!map) return;

    const markReady = () => setIsPaintReady(true);

    // Field-test feedback: waiting for the full `idle` event added a
    // perceptible 1-2s delay over slow tile downloads. We now flip
    // the skeleton off as soon as the FIRST frame paints (`render` /
    // `style.load`) — the user immediately gets an interactive map,
    // and any straggler tiles fade in underneath the already-cleared
    // skeleton. The safety timeout is also clamped to 1.8s so a
    // genuinely-stuck pipeline still releases the UI promptly.
    const armReadyListeners = () => {
      // First render = first painted frame. Fires earlier than `idle`
      // and is sufficient for the user to interact with the map.
      map.once('render', markReady);
      // Belt-and-braces — `idle` is a clean steady-state signal too.
      map.once('idle', markReady);
    };

    if (map.isStyleLoaded()) {
      armReadyListeners();
    } else {
      map.once('style.load', armReadyListeners);
    }

    const safetyTimeout = setTimeout(markReady, 900);

    return () => {
      clearTimeout(safetyTimeout);
      try { map.off('render', markReady); } catch { /* map may be gone */ }
      try { map.off('idle', markReady); } catch { /* map may be gone */ }
      try { map.off('style.load', armReadyListeners); } catch { /* */ }
    };
  }, [isMapLoaded]);

  // ── Skeleton dissolve trigger: location readiness (14.08.2026 fix) ─────
  // Flips `isLocationReady` true once `currentLocation` resolves (real GPS
  // fix or useGPS's own deliberate fallback), or after a bounded timeout.
  // Root problem this fixes: the skeleton used to clear on paint-readiness
  // ALONE, fully independent of GPS — so the user would see the map sitting
  // at the wrong default center (initialViewState's onboarding anchor, or a
  // hardcoded Tel Aviv coordinate), already interactive, for however long GPS
  // took to resolve, and only THEN watch a visible 2s animated flyTo correct
  // it (useCameraController's initial-zoom effect) — a jarring default-then-
  // jump. Waiting for location too means the skeleton now stays up through
  // that dead time; the flyTo still starts the instant location resolves
  // (same as before), but now that's also the instant the skeleton reveals
  // the map — so what the user sees is a "flying in to your location" reveal
  // animation, not a wrong center they'd already started orienting to.
  //
  // Round 4 (18.08.2026): this effect only ever runs when `hasAccurateLocationSeed`
  // is false — the initializer above already set `isLocationReady` true otherwise,
  // so the `if (isLocationReady) return;` guard below short-circuits immediately.
  // Reason: once the seed IS the user's own last real GPS fix, the "wrong default
  // center" problem this effect was built for no longer applies — the seed is
  // already accurate, and waiting up to LOCATION_READY_TIMEOUT_MS here only
  // reintroduces the race (real-world cold-GPS latency regularly exceeds that
  // budget, force-revealing the skeleton before GPS anyway). Anchor-seeded and
  // no-seed launches still go through this full wait-then-reveal path.
  useEffect(() => {
    if (isLocationReady) return;
    if (currentLocation) { setIsLocationReady(true); return; }
    const t = setTimeout(() => setIsLocationReady(true), LOCATION_READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [currentLocation, isLocationReady]);

  // ── Skeleton dissolve trigger: combine ──────────────────────────────────
  useEffect(() => {
    if (isPaintReady && isLocationReady) {
      // Persist at module scope so the next AppMap mount in this session
      // (tab switch / soft nav) starts with the skeleton already disabled.
      mapHasInitializedInSession = true;
      setIsVisuallyReady(true);
    }
  }, [isPaintReady, isLocationReady]);

  // ── Register custom pin images once the map is loaded ──
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (!map.hasImage('pin-functional')) registerPinImage(map, 'pin-functional', '#1e3a8a', drawPullUpBarIcon, ratio);
    if (!map.hasImage('pin-default')) registerPinImage(map, 'pin-default', '#00BAF7', drawDumbbellIcon, ratio);
    if (!map.hasImage('pin-minor')) registerPinImage(map, 'pin-minor', '#94a3b8', drawDotIcon, ratio);
    // Sleek arrowhead used at the end of the navigation curve LineString.
    // No badge / circle — just a clean white tip that lies on the road.
    registerArrowTipImage(map, 'nav-arrow-tip', ratio);
    // Route-direction markers (15.08.2026 redesign) — filled circle + white
    // ring + white glyph, colored by modality, reused from the existing
    // (previously unwired) registerArrowImage. 'straight' glyph = a plain
    // forward chevron; these mark flow direction, not upcoming maneuvers.
    if (!map.hasImage('route-direction-marker-aerobic')) {
      registerArrowImage(map, 'route-direction-marker-aerobic', HYBRID_AER, ratio, 'straight');
    }
    if (!map.hasImage('route-direction-marker-strength')) {
      registerArrowImage(map, 'route-direction-marker-strength', HYBRID_STR, ratio, 'straight');
    }
  }, [isMapLoaded]);

  // ── Mapbox event-listener disposal (OOM fix) ──────────────────────────────
  // `handleMapLoad` registers three Mapbox event listeners:
  //   • style.load → applyHebrewLabels (Hebrew RTL relabel)
  //   • sourcedata → debouncedHebrew  (re-apply on tile/source updates)
  //   • style.load → runDeclutter     (fitness-style POI declutter)
  // The `sourcedata` event in particular fires on every tile load — keeping
  // the closure alive across tab switches retains the entire WebGL context,
  // and iOS WKWebView OOM-kills the WebContent process after a few re-mounts.
  // This effect tears them all down on unmount (or when the gate flips).
  // Gated on `isMapLoaded` so the listeners are guaranteed to have been
  // attached before we attempt removal; the refs are captured by
  // handleMapLoad, so we read them lazily inside the cleanup closure.
  useEffect(() => {
    if (!isMapLoaded) return;
    const map = mapRef.current?.getMap();
    return () => {
      if (!map) return;
      try {
        if (hebrewHandlerRef.current) map.off('style.load', hebrewHandlerRef.current);
        if (debouncedHebrewRef.current) map.off('sourcedata', debouncedHebrewRef.current);
        if (declutterHandlerRef.current) map.off('style.load', declutterHandlerRef.current);
      } catch { /* map may already be destroyed */ }
      // Cancel any in-flight debounce timeout so the post-unmount callback
      // cannot fire and keep a dangling reference to the Mapbox instance.
      if (hebrewDebounceTimerRef.current) {
        clearTimeout(hebrewDebounceTimerRef.current);
        hebrewDebounceTimerRef.current = null;
      }
      hebrewHandlerRef.current = null;
      debouncedHebrewRef.current = null;
      declutterHandlerRef.current = null;
    };
  }, [isMapLoaded]);

  // ── Interactive cursor for clusters, pins & route lines ──
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const layers = ['park-clusters', 'park-pins', 'park-minor-pins', 'routes-active', 'routes-active-glow', 'routes-background'];
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    for (const l of layers) {
      if (map.getLayer(l)) { map.on('mouseenter', l, enter); map.on('mouseleave', l, leave); }
    }
    return () => {
      for (const l of layers) {
        try { map.off('mouseenter', l, enter); map.off('mouseleave', l, leave); } catch { /* layer may be gone */ }
      }
    };
  }, [isMapLoaded]);

  // ── Unified click handler ──
  const handleMapClick = useCallback((e: any) => {
    const map = mapRef.current?.getMap();
    if (!map) { setSelectedPark(null); return; }

    const clusters = map.queryRenderedFeatures(e.point, { layers: ['park-clusters'] });
    if (clusters.length > 0) {
      const feature = clusters[0];
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource('parks-clustered') as mapboxgl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err: any, zoom: any) => {
        if (err) return;
        // Mapbox sometimes returns null/undefined for `zoom` even when `err`
        // is null (e.g. when the cluster id is no longer in the source after
        // a viewport change). Passing null into easeTo throws "Expected
        // value to be of type number, but found null instead" deep inside
        // the camera animator. Default to one step deeper than current.
        const targetZoom = isFiniteNum(zoom)
          ? zoom
          : (mapRef.current?.getZoom() ?? 13) + 1;
        const rawCenter = (feature.geometry as GeoJSON.Point).coordinates;
        // Bulletproof guard: shape + every lng/lat must be finite. A bad
        // cluster centroid (rare, but possible during rapid GeoJSON
        // updates) used to crash the map with `LngLat invalid: NaN, NaN`.
        if (!isFiniteLngLat(rawCenter)) return;
        if (!isFiniteNum(targetZoom)) return;
        try {
          map.easeTo({ center: rawCenter, zoom: targetZoom, duration: 500 });
        } catch (err) {
          console.error('[AppMap] cluster easeTo threw — ignored.', err);
        }
      });
      return;
    }

    const pins = map.queryRenderedFeatures(e.point, { layers: ['park-pins', 'park-minor-pins'] });
    if (pins.length > 0) {
      const parkId = pins[0].properties?.id;
      const park = parks.find(p => p.id === parkId);
      if (park) {
        setSelectedPark(park);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
      }
      return;
    }

    const routeLineLayers = ['routes-active', 'routes-background'].filter(l => map.getLayer(l));
    if (routeLineLayers.length > 0) {
      const routeFeatures = map.queryRenderedFeatures(e.point, { layers: routeLineLayers });
      if (routeFeatures.length > 0) {
        const routeId = routeFeatures[0].properties?.id;
        if (routeId && onRouteSelect) {
          const route = routes.find(r => r.id === routeId);
          if (route) {
            onRouteSelect(route);
            setSelectedPark(null);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
            return;
          }
        }
      }
    }

    if (onRouteSelect && focusedRoute) onRouteSelect(null as any);
    setSelectedPark(null);
    // Empty-tap signal — DiscoverLayer subscribes to this to clear the
    // commute carousel when the user taps the map outside any feature.
    // Bumped AFTER the local clears above so subscribers see a clean
    // state on the same tick. See useMapStore.mapEmptyTapTick jsdoc.
    useMapStore.getState().bumpMapEmptyTapTick();
  }, [parks, routes, setSelectedPark, onRouteSelect, focusedRoute]);

  // ── Long-press to set mock location ──
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMouseDown = useCallback((e: any) => {
    if (!onLongPress) return;
    longPressTimer.current = setTimeout(() => {
      const { lng, lat } = e.lngLat;
      onLongPress({ lat, lng });
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([30, 50, 30]);
    }, 600);
  }, [onLongPress]);
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  // Waze-style bottom offset (needed for fitBounds padding in click handlers)
  const wazeBottomPadding = typeof window !== 'undefined'
    ? Math.round(window.innerHeight * 0.85)
    : 600;

  const routesGeoJSON = useMemo(() => {
    const features = visibleRoutes
      .filter(r => r.path && r.path.length > 1)
      .map(route => {
        // Prefer the rotated/user-prepended displayPath (set by useRouteFilter) for
        // rendering, so the line on the map matches where the user would actually run.
        // Fall back to the original stored path when displayPath is absent.
        const rawCoords = (route.displayPath && route.displayPath.length > 1)
          ? route.displayPath
          : route.path;
        // 15.08.2026 fix: out-and-back paths (outbound leg retraced in
        // reverse) render as a single overlapping line — no-op for any
        // other shape (loop, one-way), so this is safe to apply always.
        const coords = buildLaneOffsetPath(rawCoords);
        return {
          type: 'Feature',
          properties: { id: route.id, isFocused: focusedRoute?.id === route.id, isInfrastructure: route.isInfrastructure || false },
          geometry: { type: 'LineString', coordinates: coords },
        };
      });
    return { type: 'FeatureCollection', features };
  }, [visibleRoutes, focusedRoute]);

  // Direction markers for the focused route — ANY focused route (15.08.2026
  // redesign; used to be scoped to the 'hybrid-route' focus id only, which
  // is why generated aerobic routes never got arrows — see the investigation
  // in this batch's report). A fixed small set of Point markers (not a
  // repeated line-following symbol) placed by buildDirectionMarkers: each
  // carries its own precomputed windowed bearing (net direction over a
  // short stretch, not one jittery micro-segment) and a modality-colored
  // circular icon. Overview only (gated below, !isActiveWorkout).
  const routeDirectionArrowsGeoJSON = useMemo(() => {
    if (!focusedRoute) return null;
    const rawCoords = (focusedRoute.displayPath && focusedRoute.displayPath.length > 1)
      ? focusedRoute.displayPath
      : focusedRoute.path;
    if (!rawCoords || rawCoords.length < 2) return null;
    // Same lane-offset as the line itself (see routesGeoJSON) — without it,
    // an out-and-back's outbound and return legs would place markers on top
    // of each other pointing opposite ways. Markers placed on the ALREADY
    // lane-offset path automatically land on the correct lane.
    const coords = buildLaneOffsetPath(rawCoords);
    const iconImage = focusedIsStrength ? 'route-direction-marker-strength' : 'route-direction-marker-aerobic';
    // Detect the turnaround on the RAW (pre-offset) coords — isOutAndBackPath
    // needs the exact mirror-symmetry that lane-offsetting deliberately
    // breaks — then measure its along-path distance on the (offset) coords
    // actually being rendered, so buildDirectionMarkers can keep its
    // windowed bearing sample from ever straddling the reversal.
    const seamDistances = isOutAndBackPath(rawCoords)
      ? [pathLengthMeters(coords.slice(0, (coords.length - 1) / 2 + 1))]
      : [];
    const markers = buildDirectionMarkers(coords, { seamDistances });
    if (markers.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: markers.map((m) => ({
        type: 'Feature' as const,
        properties: { bearing: m.bearing, iconImage },
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      })),
    };
  }, [focusedRoute?.id, focusedRoute?.path, focusedRoute?.displayPath, focusedIsStrength]);

  // ── Imperative live-path update ────────────────────────────────────────────
  // Fires only when the number of accepted GPS samples grows (every 5 m /
  // DISTANCE_THRESHOLD). Calling setData() directly on the Mapbox GeoJSON
  // source bypasses React reconciliation entirely — zero re-renders per GPS
  // tick. The source is kept always-mounted while isActiveWorkout is true
  // (see the JSX below) so the source handle is always available here.
  useEffect(() => {
    if (!isActiveWorkout) return;
    const rawMap = mapRef.current?.getMap?.() as (mapboxgl.Map | undefined);
    if (!rawMap) return;
    const src = rawMap.getSource('live-path') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(buildLivePathGeoJSON(livePath ?? [], livePathZones));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePath?.length, isActiveWorkout]);

  // ── Ghost path: segment AHEAD of the user ─────────────────────────────────
  // Caches the scan start index in a ref so the path-ahead slice only
  // recomputes when the route changes OR when a new GPS coord is accepted
  // (livePath.length tick) — NOT on every raw GPS position update.
  const ghostStartIdxRef = useRef(0);
  const ghostPathGeoJSON = useMemo(() => {
    if (!isActiveWorkout || !focusedRoute?.path || focusedRoute.path.length < 2) {
      ghostStartIdxRef.current = 0;
      return null;
    }

    // Scan forward-only from last cached position so we never regress backward.
    if (currentLocation) {
      const path = focusedRoute.path;
      const fromIdx = ghostStartIdxRef.current;
      let minDist = Infinity;
      let bestIdx  = fromIdx;
      for (let i = fromIdx; i < path.length; i++) {
        const [lng, lat] = path[i];
        const d = Math.abs(lat - currentLocation.lat) + Math.abs(lng - currentLocation.lng);
        if (d < minDist) { minDist = d; bestIdx = i; }
        // Early exit: once we're past the nearest point and moving away, stop scanning.
        else if (i > fromIdx + 5 && d > minDist * 4) break;
      }
      ghostStartIdxRef.current = bestIdx;
    }

    const aheadPath = focusedRoute.path.slice(ghostStartIdxRef.current);
    if (aheadPath.length < 2) return null;

    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: aheadPath } }],
    };
  // Dep on livePath?.length instead of currentLocation: recomputes only when
  // the user walks far enough to add a new GPS coord (every DISTANCE_THRESHOLD
  // metres), not on every raw GPS tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveWorkout, focusedRoute?.id, focusedRoute?.path, livePath?.length]);

  // ── Zone-segment gate for ALL trail additions ──────────────────────────────
  // A zone-coloured planned run (livePathZones non-null) must render exactly
  // as before this feature: no fading trail, no gray passed slice, no
  // deviation connector. One shared flag guards all three (code-review
  // finding: gating only the fade layer left the other two mounting on
  // interval runs that carry a guided route).
  const hasZoneSegments = !!livePathZones?.some((z) => z != null);

  // ── Passed path: the route slice BEHIND the user ──────────────────────────
  // Complements the ghost path (ahead slice): together they draw the full
  // planned route split at the user's position — gray behind, cyan ahead.
  // Depends on ghostPathGeoJSON so it always reads ghostStartIdxRef AFTER the
  // ghost memo (declared above) advanced it this render. +1 keeps the split
  // vertex shared, so the two slices connect without a gap.
  const passedPathGeoJSON = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!isActiveWorkout || hasZoneSegments || !ghostPathGeoJSON || !focusedRoute?.path) return null;
    const passed = focusedRoute.path.slice(0, ghostStartIdxRef.current + 1);
    if (passed.length < 2) return null;
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: passed } }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveWorkout, hasZoneSegments, focusedRoute?.id, focusedRoute?.path, ghostPathGeoJSON]);

  // ── Off-route connector: user → route split point ─────────────────────────
  // Store flag subscribed at the top of the component (isOffRoute) — not the
  // per-sample deviation meters — so this only exists while genuinely
  // off-route. currentLocation as a dep is fine here: off-route episodes are
  // rare and short-lived.
  const deviationGeoJSON = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!isActiveWorkout || hasZoneSegments || !isOffRoute || !ghostPathGeoJSON || !focusedRoute?.path) return null;
    if (!isFiniteLatLng(currentLocation)) return null;
    const target = focusedRoute.path[ghostStartIdxRef.current];
    if (!target || !isFiniteLngLat(target)) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[currentLocation!.lng, currentLocation!.lat], target] },
      }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveWorkout, hasZoneSegments, isOffRoute, ghostPathGeoJSON, focusedRoute?.path, currentLocation]);

  // ── Navigation turn arrow GeoJSON (curve-following) ──────────────────────
  // Builds a short LineString that traces the actual route geometry around
  // the active turn vertex (3 path-points before + the turn + 3 after, where
  // available). A second Point feature sits at the END of that line so a
  // sleek arrowhead can be placed there with rotation matching the line's
  // last segment — together they read as a single elongated arrow that
  // BENDS along the road instead of a static badge.
  //
  // Emits an empty collection when there is no active selection or the
  // path slice would have fewer than 2 finite vertices.
  const NAV_ARROW_PATH_RADIUS = 3;
  const turnArrowGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const turns = navigationTurns ?? [];
    const path  = focusedRoute?.path ?? [];
    if (
      activeTurnIdx < 0 || activeTurnIdx >= turns.length ||
      !Array.isArray(path) || path.length < 2
    ) {
      return { type: 'FeatureCollection', features: [] };
    }
    const t = turns[activeTurnIdx];
    if (!isFiniteNum(t.lat) || !isFiniteNum(t.lng)) {
      return { type: 'FeatureCollection', features: [] };
    }
    // pathIndex === turn vertex index in the original path array.
    const idx = isFiniteNum(t.pathIndex) ? t.pathIndex : -1;
    const startIdx = Math.max(0, idx - NAV_ARROW_PATH_RADIUS);
    // 15.08.2026 fix: a turnaround vertex (out-and-back reversal) sits at
    // the exact midpoint of a symmetric path — slicing past it the same
    // way as an ordinary turn just re-enters the mirrored return leg
    // (identical coordinates in reverse), producing a folded, misleading
    // "continue" direction. There's no real new geometry past a genuine
    // reversal to show, so cap the slice AT the vertex — the arrow traces
    // the approach and its tip lands on the turnaround point itself.
    const endIdx = t.isTurnaround
      ? idx
      : Math.min(path.length - 1, idx + NAV_ARROW_PATH_RADIUS);
    const slice = path
      .slice(startIdx, endIdx + 1)
      .filter(
        (c): c is [number, number] =>
          Array.isArray(c) && c.length === 2 &&
          Number.isFinite(c[0]) && Number.isFinite(c[1]),
      );
    if (slice.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    const tipCoord = slice[slice.length - 1];
    const tipPrev  = slice[slice.length - 2];
    const tipBearingRaw = bearingBetween(
      tipPrev[1],  tipPrev[0],
      tipCoord[1], tipCoord[0],
    );
    const tipBearing = Number.isFinite(tipBearingRaw) ? tipBearingRaw : 0;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: slice },
          properties: { kind: 'line', streetName: t.streetName ?? '' },
        },
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: tipCoord },
          properties: { kind: 'tip', bearing: tipBearing, streetName: t.streetName ?? '' },
        },
      ],
    };
    // Fine-grain deps: depend on `path` (the array reference is stable
    // across unrelated route-object rebuilds) and `id` (so a route swap
    // forces a recompute), NOT on the whole `focusedRoute` object. This
    // is what stops the Source data prop from getting a new object every
    // GPS tick — which used to push fresh tiles to the GPU on each
    // sample and gradually fill Mapbox's WebGL buffer pool.
  }, [navigationTurns, activeTurnIdx, focusedRoute?.id, focusedRoute?.path]);

  const handleMapLoad = (e: any) => {
    const rawMap = e?.target || mapRef.current?.getMap?.() || mapRef.current;
    if (!rawMap || typeof rawMap.getStyle !== 'function') return;

    // Custom GeoJSON layer IDs that must never have their text-field overwritten by the
    // Hebrew label pass — doing so would blank out cluster counts and custom icons.
    const CUSTOM_LAYER_IDS = new Set([
      'park-clusters-glow', 'park-clusters', 'park-pins', 'park-minor-pins', 'park-cluster-count',
      'routes-background', 'routes-active-glow', 'routes-active-outline', 'routes-active',
      'live-path-trace', 'live-path-trail-fade', 'ghost-path-glow', 'ghost-path-line', 'sim-walk-trail',
      'route-passed-line', 'route-deviation-line',
      // Navigation ground visuals (curve + tip) — exempt from the Hebrew
      // label pass so it doesn't try to set text-field on a line/icon layer.
      'nav-arrow-line-glow', 'nav-arrow-line', 'nav-arrow-tip',
    ]);

    const applyHebrewLabels = (opts?: { force?: boolean }) => {
      // Idempotency (perf/batch1): once the sweep has run, the labelled symbol
      // layers keep their Hebrew text-field, so repeat passes from debounced
      // 'sourcedata' during a pan are no-ops — skip the whole ~150-layer loop.
      // A style rebuild passes force:true (via the style.load wrapper below,
      // which first re-arms the guard). Gated by the same flag as the metadata
      // gate so that when IS_PERF_BATCH1_ENABLED is false the sweep runs every
      // time exactly as before (byte-identical rollback).
      if (IS_PERF_BATCH1_ENABLED && hebrewLabelsAppliedRef.current && !opts?.force) return;
      try {
        const style = rawMap.getStyle();
        if (!style?.layers) return;
        for (const layer of style.layers) {
          // Skip our own GeoJSON layers — they manage their own text-field expressions.
          if (CUSTOM_LAYER_IDS.has(layer.id)) continue;
          try {
            if (layer.type === 'symbol' && (layer as any).layout?.['text-field']) {
              rawMap.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]);
            }
          } catch { /* skip locked/internal layers */ }
        }
        // Mark done only after a full pass over a real style — if getStyle()
        // wasn't ready (early return above) the guard stays false so the next
        // event retries.
        hebrewLabelsAppliedRef.current = true;
      } catch (err) { console.warn('Could not set Hebrew labels:', err); }
    };
    const debouncedHebrew = (e?: { sourceDataType?: string }) => {
      // Gate (perf/batch1, flag-gated): only relabel when a source's METADATA
      // (re)loads — NOT on every per-tile 'content' event. `sourcedata` fires on
      // every tile load during pan/zoom; label layers are style-defined (not
      // per-tile), so their text-field is already set. Re-running
      // applyHebrewLabels — a full pass over ~150 style layers calling
      // setLayoutProperty on each — on every tile was the sustained-heat hot
      // path while panning. When IS_PERF_BATCH1_ENABLED is false, this gate is
      // skipped and we relabel on every 'sourcedata' exactly as before.
      if (IS_PERF_BATCH1_ENABLED && e && e.sourceDataType !== 'metadata') return;
      // Nothing to re-apply once the one-time sweep has run (see idempotency
      // note above) — skip even scheduling the timer to avoid per-tile
      // setTimeout/clearTimeout churn while panning. A style rebuild re-arms via
      // the style.load force-path.
      if (IS_PERF_BATCH1_ENABLED && hebrewLabelsAppliedRef.current) return;
      if (hebrewDebounceTimerRef.current) clearTimeout(hebrewDebounceTimerRef.current);
      hebrewDebounceTimerRef.current = setTimeout(applyHebrewLabels, 50);
    };

    applyHebrewLabels();
    // A real 'style.load' rebuilds the layers, so the Hebrew text-field is gone
    // — re-arm the idempotency guard and force a full sweep. Wrapped because the
    // style.load event object must NOT be passed as the `opts` arg (it has no
    // `force`, which would let the skip suppress the needed re-run).
    const applyHebrewLabelsOnStyleLoad = () => {
      hebrewLabelsAppliedRef.current = false;
      applyHebrewLabels({ force: true });
    };
    rawMap.on('style.load', applyHebrewLabelsOnStyleLoad);
    rawMap.on('sourcedata', debouncedHebrew);

    // Capture handler identities for unmount disposal. Mapbox's `off()`
    // matches by reference, so we MUST keep the same function instances
    // around to detach them later. See the cleanup useEffect below.
    hebrewHandlerRef.current = applyHebrewLabelsOnStyleLoad;
    debouncedHebrewRef.current = debouncedHebrew;

    // ── Fitness declutter — timing fix ──────────────────────────────────────
    // Diagnostic confirmed: isStyleLoaded() is false during the onLoad callback
    // because Mapbox fires onLoad when the map container is ready, not when all
    // style tiles are painted. Strategy: register on('style.load') for both the
    // initial load and any future style swaps, then call immediately only if the
    // style is already parsed (rare on first load, common on hot-reload).
    const runDeclutter = () => {
      // A real 'style.load' means the style was (re)built — clear the declutter
      // idempotency guard so the sweep re-runs for the new style, then apply.
      // On the initial load this reset is a no-op; on a future setStyle it
      // ensures the freshly-built style gets decluttered. Flag-gated so that
      // when off, runDeclutter is byte-identical to the original (apply only).
      if (IS_PERF_BATCH1_ENABLED) resetFitnessMapStyle(rawMap);
      applyFitnessMapStyle(rawMap, 'style.load');
    };
    rawMap.on('style.load', runDeclutter);
    declutterHandlerRef.current = runDeclutter;
    if (rawMap.isStyleLoaded()) {
      // Tag this immediate call distinctly from the listener-driven one
      // so the console trace makes it obvious whether the synchronous
      // fast-path won (rare on first load, common on hot-reload) or
      // whether the on('style.load') listener picked it up.
      applyFitnessMapStyle(rawMap, 'style-already-loaded');
    }

    // Wire camera controller's interaction listeners (mousedown, wheel, touch, movestart)
    camera.onMapReady(rawMap);

    setIsMapLoaded(true);
    if (onMapRef && mapRef.current) onMapRef(mapRef.current);
    // Seed the store so viewport-search has a baseline even before the user pans.
    const initB = mapRef.current?.getBounds();
    if (initB) {
      useMapStore.getState().setViewportBounds({
        neLng: initB.getNorthEast().lng, neLat: initB.getNorthEast().lat,
        swLng: initB.getSouthWest().lng, swLat: initB.getSouthWest().lat,
      });
    }
  };

  const syncViewportToStore = () => {
    const b = mapRef.current?.getBounds();
    if (!b) return;
    setViewportBounds(b);
    useMapStore.getState().setViewportBounds({
      neLng: b.getNorthEast().lng, neLat: b.getNorthEast().lat,
      swLng: b.getSouthWest().lng, swLat: b.getSouthWest().lat,
    });
  };

  return (
    <div className="w-full h-full relative bg-[#f3f4f6] overflow-hidden">
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        onZoom={(e) => {
          // Threshold-commit (see ZOOM_COMMIT_EPSILON): return prev unchanged so
          // React bails the render until the zoom moves far enough to possibly
          // flip a breakpoint. Kills the per-frame full-tree re-render storm.
          const z = e.viewState.zoom;
          setCurrentZoom((prev) => (Math.abs(z - prev) >= ZOOM_COMMIT_EPSILON ? z : prev));
        }}
        onZoomEnd={(e) => {
          setCurrentZoom(e.viewState.zoom);
          syncViewportToStore();
        }}
        onMoveEnd={syncViewportToStore}
        initialViewState={
          initialCenter
            ? { longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: 14 }
            : { longitude: 34.7818, latitude: 32.0853, zoom: 13 }
        }
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        // §2 dense-city OOM: bound the tile cache. Unset, mapbox-gl retains a
        // viewport-derived (uncapped) set of vector/raster tiles that grows as
        // the user pans a dense city, holding each tile's GPU texture. 45 ≈ the
        // current viewport (~6-12 tiles on a phone) + one surrounding pan ring,
        // well under mapbox's ~5x-viewport default. Conservative starting point —
        // raise if panning back re-fetches visibly, lower if memory still climbs.
        maxTileCacheSize={45}
        locale={{ 'NavigationControl.ZoomIn': 'הגדל', 'NavigationControl.ZoomOut': 'הקטן' }}
        onClick={handleMapClick}
        onMouseDown={onLongPress ? handleMouseDown : undefined}
        onMouseUp={onLongPress ? clearLongPress : undefined}
        onMouseMove={onLongPress ? clearLongPress : undefined}
        onTouchStart={onLongPress ? handleMouseDown : undefined}
        onTouchEnd={onLongPress ? clearLongPress : undefined}
        onTouchMove={onLongPress ? clearLongPress : undefined}
      >
        {isMapLoaded && (
        <>
        {/* ── Route layers ── (lineMetrics enables line-progress for the point-15
             hybrid line-gradient on routes-active; the flat-color layers ignore it,
             so non-hybrid routes render identically) ── */}
        {!isActiveWorkout && visibleLayers?.includes('routes') && (
          <Source id="routes" type="geojson" data={routesGeoJSON as any} lineMetrics>
            <Layer id="routes-background" type="line" paint={ROUTES_BACKGROUND.paint as any} layout={ROUTES_BACKGROUND.layout} />
            <Layer id="routes-active-glow" type="line" filter={ROUTES_ACTIVE_GLOW.filter} paint={routesGlowPaint as any} layout={ROUTES_ACTIVE_GLOW.layout} />
            <Layer id="routes-active-outline" type="line" filter={ROUTES_ACTIVE_OUTLINE.filter} paint={ROUTES_ACTIVE_OUTLINE.paint as any} layout={ROUTES_ACTIVE_OUTLINE.layout} />
            <Layer id="routes-active" type="line" filter={ROUTES_ACTIVE.filter} paint={routesActivePaint as any} layout={ROUTES_ACTIVE.layout} />
          </Source>
        )}

        {/* ── Route direction markers (15.08.2026 redesign): a small fixed set of
            Point features (buildDirectionMarkers — evenly spaced by real distance,
            each with its own precomputed windowed bearing), NOT a repeated
            line-following symbol — that's what made the old version crowd
            longer routes and fan out on windy streets (each tiny segment
            auto-rotating independently). Filled circle + white ring + white
            glyph, colored by modality (route-direction-marker-aerobic/-strength,
            registered above). Overview only; now renders for ANY focused route,
            not just the hybrid one — this is what fixes generated routes having
            no arrows at all. icon-allow-overlap:true because the count is
            already small/deliberate — no reason to let Mapbox's collision
            engine drop any of them. Zoom-dependent opacity fade (refinement,
            15.08.2026): hidden at the whole-route overview zoom, fades in
            once the user zooms in — see DIRECTION_ARROW_MIN_ZOOM above. The
            route line and start/finish marker are separate layers and stay
            visible at every zoom. ── */}
        {!isActiveWorkout && visibleLayers?.includes('routes') && routeDirectionArrowsGeoJSON && (
          <Source id="route-direction-arrows" type="geojson" data={routeDirectionArrowsGeoJSON as any}>
            <Layer
              id="route-direction-arrows"
              type="symbol"
              layout={{
                'icon-image': ['get', 'iconImage'],
                'icon-rotate': ['get', 'bearing'],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.35, 17, 0.6],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              }}
              paint={{
                'icon-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  DIRECTION_ARROW_MIN_ZOOM, 0,
                  DIRECTION_ARROW_MIN_ZOOM + DIRECTION_ARROW_FADE_ZOOM_RANGE, 0.95,
                ],
              }}
            />
          </Source>
        )}

        {/* ── Active workout paths ───────────────────────────────────────── */}
        {isActiveWorkout && (
          <>
            {/* Trace path: always mounted so the imperative setData effect above
                can update it without waiting for the Source to be conditionally
                added. Starts with an empty FeatureCollection; the effect hydrates
                it on the first accepted GPS coord.
                lineMetrics is required for the free-run fading gradient below —
                harmless for the flat-paint variants.
                Two mutually-exclusive layer ids (never a paint-shape swap on one
                layer): the fading comet-tail renders only for a FREE session
                (no route, no zone segments); guided routes keep the subtle
                trace, and zone-segmented planned runs are untouched (a
                per-feature gradient would restart the fade every zone). */}
            <Source id="live-path" type="geojson" data={EMPTY_FEATURE_COLLECTION as any} lineMetrics>
              {!ghostPathGeoJSON && !hasZoneSegments ? (
                <Layer id="live-path-trail-fade" type="line" paint={TRAIL_FADE_LINE.paint as any} layout={TRAIL_FADE_LINE.layout} />
              ) : (
                <Layer id="live-path-trace" type="line" paint={TRACE_PATH_LINE.paint as any} layout={TRACE_PATH_LINE.layout} />
              )}
            </Source>

            {/* Passed route slice: gray line BEHIND the user — drawn before the
                ghost source so the bright remaining slice sits on top. */}
            {passedPathGeoJSON && (
              <Source id="route-passed" type="geojson" data={passedPathGeoJSON as any}>
                <Layer id="route-passed-line" type="line" paint={ROUTE_PASSED_LINE.paint as any} layout={ROUTE_PASSED_LINE.layout} />
              </Source>
            )}

            {/* Ghost path: the full planned route — vibrant cyan goal line, drawn on top */}
            {ghostPathGeoJSON && (
              <Source id="ghost-path" type="geojson" data={ghostPathGeoJSON as any}>
                <Layer id="ghost-path-glow" type="line" paint={GHOST_PATH_GLOW.paint as any} layout={GHOST_PATH_GLOW.layout} />
                <Layer id="ghost-path-line" type="line" paint={GHOST_PATH_LINE.paint as any} layout={GHOST_PATH_LINE.layout} />
              </Source>
            )}

            {/* Off-route connector: dashed gray link from the user back to the
                route split point — mounted only while isOffRoute. */}
            {deviationGeoJSON && (
              <Source id="route-deviation" type="geojson" data={deviationGeoJSON as any}>
                <Layer id="route-deviation-line" type="line" paint={ROUTE_DEVIATION_LINE.paint as any} layout={ROUTE_DEVIATION_LINE.layout} />
              </Source>
            )}
          </>
        )}

        {/* ── Navigation ground arrow — sleek line that follows the curve ────────
            Replaces the previous circular badge entirely. The geometry is a
            short slice of the actual route path around the active turn vertex,
            so the arrow visibly bends through the maneuver — left turns lean
            left, hairpins curl, slight bends barely tilt.
            Three layers share one GeoJSON source (single render pass):
              • nav-arrow-line-glow — soft outer halo for legibility on busy tiles
              • nav-arrow-line      — clean white stroke
              • nav-arrow-tip       — sleek triangular tip at the line's end,
                                       rotated to the last-segment bearing,
                                       map-pitched so it lies on the road. */}
        {isNavigationMode && turnArrowGeoJSON.features.length > 0 && (
          <Source id="nav-turn-arrow" type="geojson" data={turnArrowGeoJSON}>
            <Layer
              id="nav-arrow-line-glow"
              type="line"
              filter={['==', ['get', 'kind'], 'line']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#ffffff',
                'line-opacity': 0.35,
                'line-width': ['interpolate', ['linear'], ['zoom'], 15, 10, 18.5, 22],
                'line-blur': 4,
              }}
            />
            <Layer
              id="nav-arrow-line"
              type="line"
              filter={['==', ['get', 'kind'], 'line']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#ffffff',
                'line-width': ['interpolate', ['linear'], ['zoom'], 15, 5, 18.5, 11],
              }}
            />
            <Layer
              id="nav-arrow-tip"
              type="symbol"
              filter={['==', ['get', 'kind'], 'tip']}
              layout={{
                'icon-image': 'nav-arrow-tip',
                'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.55, 18.5, 1.0],
                'icon-rotate': ['get', 'bearing'],
                'icon-rotation-alignment': 'map',
                'icon-pitch-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              }}
            />
          </Source>
        )}

        {/* ── Walk-to-route: dashed cyan line from user → nearest route endpoint ──
            The hook controls visibility: loads in discover mode, persists
            during active workout until the user arrives at the route endpoint
            (within 30 m) or 60 s elapse. The hook itself returns null when done. */}
        {walkToRoute.geoJSON && (
          <Source id="walk-to-route" type="geojson" data={walkToRoute.geoJSON as any}>
            <Layer
              id="walk-to-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#00E5FF',
                'line-width': 4,
                'line-dasharray': [3, 3],
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* ── Simulation walk trail — DISABLED (was distracting orange dashes) ── */}

        {/* ── Partner presence: heatmap + dots (always-on density signal) ──
            Heatmap and small-dot tiers render whenever any presence doc
            matches the active activity filter. They are an ambient "where
            the action is" indicator that thins out as the user narrows the
            filter (e.g. switching from 'all' to 'running' removes strength
            presence from the heat density), but they stay visible whether
            or not the partner-finder UI is open — `liveUsersVisible` only
            gates the full <Marker> tier below. */}
        {activityFilteredPositions.length > 0 && (
          <Source id="partner-presence" type="geojson" data={throttledPresenceGeoJSON}>
            <Layer {...PRESENCE_HEATMAP_LAYER} />
            <Layer {...PRESENCE_DOTS_LAYER} />
          </Source>
        )}

        {/* ── Parks: Clustered GeoJSON Source ──
            All Layers stay always-on so map density is consistent across
            zoom and activity. The `park-pins` Layer's filter is augmented
            with a "skip selected" clause so the SymbolLayer pin for the
            currently-highlighted park hides while the React photo bubble
            takes over its slot — preventing a stacked vector-pin + photo
            silhouette at the same coordinate. */}
        <Source id="parks-clustered" type="geojson" data={parksGeoJSON} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
          <Layer id="park-clusters-glow" type="circle" filter={PARK_CLUSTERS_GLOW.filter} paint={PARK_CLUSTERS_GLOW.paint as any} />
          <Layer id="park-clusters" type="circle" filter={PARK_CLUSTERS.filter} paint={PARK_CLUSTERS.paint as any} />
          <Layer
            id="park-pins"
            type="symbol"
            filter={parkPinsFilter}
            minzoom={PARK_PINS.minzoom}
            layout={PARK_PINS.layout as any}
          />
          <Layer id="park-minor-pins" type="symbol" filter={PARK_MINOR_PINS.filter} minzoom={PARK_MINOR_PINS.minzoom} layout={PARK_MINOR_PINS.layout as any} />
          <Layer id="park-cluster-count" type="symbol" filter={PARK_CLUSTER_COUNT.filter} layout={PARK_CLUSTER_COUNT.layout as any} paint={PARK_CLUSTER_COUNT.paint as any} />
        </Source>

        {/* ── Destination-highlight photo marker (single, selected park) ──
            One <Marker> at a time = constant DOM/WebGL cost regardless
            of city size. The vector pin for this park is filtered out of
            `park-pins` above so we render a single clean silhouette.
            Anchor="bottom" pins the tail tip exactly on the geographic
            point. The marker auto-billboards (HTML overlay) so the
            photo always faces the camera. */}
        {showSelectedParkPhoto
          && selectedParkPhotoData
          && isFiniteLatLng({
            lat: selectedParkPhotoData.lat,
            lng: selectedParkPhotoData.lng,
          }) && (
          <Marker
            key={selectedParkPhotoData.id}
            longitude={selectedParkPhotoData.lng}
            latitude={selectedParkPhotoData.lat}
            anchor="bottom"
          >
            <ParkPhotoMarker
              name={selectedParkPhotoData.name}
              photoUrl={selectedParkPhotoData.photoUrl}
              size={56}
              isSelected
              onClick={() => {
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                  navigator.vibrate(8);
                }
              }}
            />
          </Marker>
        )}

        {/* ── Commute destination pin (premium, glowing) ────────────────────
            Rendered exclusively in commute mode. The pin is anchored at
            its bottom tip on the destination lat/lng so the geographic
            placement is exact. Hidden the moment commuteDestination
            clears (i.e. the user backs out of commute or finishes the
            session). Z-stacking sits inside Mapbox's <Marker> overlay
            layer — same plane as ParkPhotoMarker — so it correctly
            paints above tiles + parks but below the active-workout
            chrome (z-40). */}
        {commuteDestination
          && Array.isArray(commuteDestination.coords)
          && commuteDestination.coords.length === 2
          && isFiniteLatLng({
            lat: commuteDestination.coords[1],
            lng: commuteDestination.coords[0],
          }) && (
          <Marker
            key="commute-destination"
            longitude={commuteDestination.coords[0]}
            latitude={commuteDestination.coords[1]}
            anchor="bottom"
          >
            <DestinationMarker label={commuteDestination.label} />
          </Marker>
        )}

        {/* ── User marker — Lemur avatar (zoom-scaled) ──────────────────── */}
        {/* `isFiniteLatLng` (not bare truthy) is THE gate. A truthy gate
            admits {lat: NaN, lng: NaN} which Mapbox's <Marker> internals
            then convert through LngLat.convert() and throw "Expected
            value to be of type number, but found null" — same crash
            class the user is hitting. The finite gate stops it cold
            before the React tree ever mounts the Marker. */}
        {/* Round 7 (18.08.2026): seed the marker from the last-known GPS fix
            while the live one is still resolving — mirrors the camera's own
            seed-first dive (round 4/6). Gated on BOTH hasAccurateLocationSeed
            AND isSeedFresh, NOT a naive `currentLocation ?? initialCenter`:
            initialCenter can be the hardcoded Tel Aviv fallback (no cached
            GPS at all) or a coarse anchor-tier seed — hasAccurateLocationSeed
            alone only rules those out, it's deliberately age-agnostic (the
            camera's own seed, which must stay that way — see its own doc
            comment above). isSeedFresh is the separate, additional bar: even
            a real last-GPS seed can be hours/days stale, and unlike the
            camera (which always corrects via dive+retarget regardless of
            accuracy), showing the user's own avatar at a position is a
            factual claim — a stale-but-technically-real seed would show the
            user somewhere they may no longer be. No live fix and no
            fresh+accurate seed → render no marker, exactly as before. Swaps
            to the live position the instant it lands — same <Marker> either
            way, no distinct provisional visual (matches the camera
            precedent). */}
        {(() => {
          const markerPos = isFiniteLatLng(currentLocation)
            ? currentLocation
            : (hasAccurateLocationSeed && isSeedFresh && isFiniteLatLng(initialCenter) ? initialCenter : null);
          if (!markerPos) return null;

          // Scale the lemur based on zoom. CSS transform keeps the anchor point stable
          // (no DOM reflow) and the 0.2s transition makes the resize feel organic.
          // Below zoom 10 we replace the avatar with a compact blue pulse dot.
          const lemurScale = currentZoom >= 15 ? 1 : currentZoom >= 10 ? 0.67 : 0;
          const showPulseDot = currentZoom < 10;

          if (showPulseDot) {
            return (
              <Marker longitude={markerPos.lng} latitude={markerPos.lat} anchor="center">
                <div className="relative flex items-center justify-center" style={{ width: 20, height: 20 }}>
                  {/* Outer ping ring */}
                  <div
                    className="absolute rounded-full animate-ping"
                    style={{ inset: 0, background: 'rgba(0,122,255,0.25)' }}
                  />
                  {/* Solid blue core */}
                  <div
                    className="rounded-full border-2 border-white"
                    style={{ width: 14, height: 14, background: '#007AFF', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
                  />
                </div>
              </Marker>
            );
          }

          return (
            <Marker longitude={markerPos.lng} latitude={markerPos.lat} anchor="center">
              {/* Fixed 60 px wrapper so the Mapbox anchor never shifts; only the visual
                  scale changes via CSS transform — no layout reflow, pure compositing. */}
              <div
                style={{
                  width: 60,
                  height: 60,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${lemurScale})`,
                  transition: 'transform 0.2s ease-out',
                }}
              >
                {isNavigationMode ? (
                  // Waze-style: in nav mode the map is already rotated so "screen up" = heading.
                  <div className="relative flex flex-col items-center" style={{ gap: 0 }}>
                    {/* Cyan direction cone — points to the top of the screen (= heading) */}
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderBottom: '14px solid #00E5FF',
                        filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.9))',
                        marginBottom: '-3px',
                      }}
                    />
                    {/* Lemur with cyan halo. Pulsing animate-ping glow removed
                        (perf/heat, 11.08.2026) — nav mode is exactly where heat/
                        freeze reports were worst, and this ran a continuous
                        per-frame compositor layer on the user's own marker for
                        the whole navigation session. Steady ring carries the
                        identity. Do not re-add without gating. */}
                    <div className="relative">
                      <div
                        className="absolute rounded-full"
                        style={{ inset: '-2px', border: '2px solid rgba(0,229,255,0.5)' }}
                      />
                      <LemurMarker size={52} personaId={userPersonaId} />
                    </div>
                  </div>
                ) : (
                  // Idle mode: bright cyan ring distinguishes the user's marker
                  // from muted partner markers at a glance. The slow animate-ping
                  // pulse that used to sit here was removed (perf/heat, 11.08.2026)
                  // — an unconditional continuous per-frame compositor layer on
                  // the map's default resting state. Same fix already shipped on
                  // PartnerMarker.tsx; do not re-add without gating.
                  <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
                    {/* Solid cyan ring */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        inset: -3,
                        border: '2.5px solid rgba(0,229,255,0.9)',
                        boxShadow: '0 0 10px rgba(0,229,255,0.55), 0 0 22px rgba(0,229,255,0.2)',
                      }}
                    />
                    <LemurMarker size={52} personaId={userPersonaId} />
                  </div>
                )}
              </div>
            </Marker>
          );
        })()}

        {/* ── Destination marker ── */}
        {/* Same finite gate as the user marker — destinationMarker comes
            in from external state (search result, community deep-link)
            and may briefly be {lat: null, lng: null} during navigation
            transitions. */}
        {isFiniteLatLng(destinationMarker) && (
          <Marker longitude={destinationMarker.lng} latitude={destinationMarker.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="bg-purple-600 p-2 rounded-full shadow-lg shadow-purple-500/50 animate-bounce border-2 border-white">
                <MapPin size={24} color="white" fill="white" />
              </div>
              <div className="w-2 h-2 bg-purple-600 rounded-full blur-[2px] mt-1" />
            </div>
          </Marker>
        )}

        {/* ── Hybrid stop markers (Part 5) ──
            One per resolved stop, not just the first. Each stop IS a park, so we reuse the
            map's own park representation: the real ParkPhotoMarker (that stop's OWN image)
            at station size when that specific park has one, else the cyan park-pin identity
            (matching pin-default) — the fallback is per-stop, not all-or-nothing. */}
        {(hybridStations ?? []).filter((s) => isFiniteLatLng(s)).map((stop, i) => (
          <Marker key={`hybrid-stop-${i}-${stop.lat}-${stop.lng}`} longitude={stop.lng} latitude={stop.lat} anchor="bottom">
            {stop.image ? (
              <div className="pointer-events-none">
                <ParkPhotoMarker name={stop.name ?? 'תחנת כוח'} photoUrl={stop.image} size={64} isSelected />
              </div>
            ) : (
              <div className="flex flex-col items-center pointer-events-none">
                {stop.name && (
                  <div dir="rtl" className="mb-1 px-2 py-0.5 rounded-full text-[11px] font-black text-white whitespace-nowrap"
                    style={{ background: '#00BAF7', boxShadow: '0 4px 10px rgba(0,0,0,0.18)' }}>
                    {stop.name}
                  </div>
                )}
                <div className="relative flex items-center justify-center">
                  <div className="absolute rounded-full animate-ping" style={{ width: 50, height: 50, background: 'rgba(0,186,247,0.25)' }} />
                  <div className="relative p-2.5 rounded-full border-[3px] border-white" style={{ background: '#00BAF7', boxShadow: '0 6px 16px rgba(0,186,247,0.55)' }}>
                    <Dumbbell size={22} color="white" />
                  </div>
                </div>
                <div className="w-2.5 h-2.5 rounded-full blur-[2px] mt-1" style={{ background: '#00BAF7' }} />
              </div>
            )}
          </Marker>
        ))}

        {/* ── Leg-plan stop markers (ג' Phase 3, 08.08) ──
            Numbered so the composed order is visible on the map at a glance —
            deliberately a different color/shape from the hybrid stop markers
            above (unrelated feature, avoid visual confusion between the two).
            The plan store empties on run-start / clear-all / drawer-close, so
            these disappear on their own — no extra cleanup needed here. */}
        {(legPlanStops ?? []).filter((s) => isFiniteLatLng(s)).map((stop, i) => (
          <Marker key={`legplan-stop-${stop.id}`} longitude={stop.lng} latitude={stop.lat} anchor="bottom">
            <div className="flex flex-col items-center pointer-events-none">
              {stop.label && (
                <div dir="rtl" className="mb-1 px-2 py-0.5 rounded-full text-[11px] font-black text-white whitespace-nowrap"
                  style={{ background: '#7C3AED', boxShadow: '0 4px 10px rgba(0,0,0,0.18)' }}>
                  {stop.label}
                </div>
              )}
              <div
                className="relative flex items-center justify-center w-8 h-8 rounded-full border-[3px] border-white"
                style={{ background: '#7C3AED', boxShadow: '0 6px 16px rgba(124,58,237,0.55)' }}
              >
                <span className="text-white text-[13px] font-black leading-none">{i + 1}</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full blur-[2px] mt-1" style={{ background: '#7C3AED' }} />
            </div>
          </Marker>
        ))}

        {/* ── Route start/finish markers (15.08.2026 arrow refinements: made
            more prominent + a flag glyph). Generated routes are loops or
            out-and-backs — start and finish are the SAME point — so this
            ONE marker plays both roles. A genuinely point-to-point route
            (today: only commute — see the distinct-finish-marker block
            below) gets a second, separate marker at its actual end. ── */}
        {!isActiveWorkout && visibleRoutes.map(route => {
          const startPoint = route.path?.[0];
          // Guard against malformed paths produced by upstream generators.
          // `startPoint` may be present-but-broken: `[null, null]`, NaN, or
          // a non-array. Mapbox's <Marker> throws "Expected number, found
          // null" when handed any of those, which blanks the entire map.
          if (!isFiniteLngLat(startPoint)) return null;
          const isSelected = focusedRoute?.id === route.id;
          if (isSelected && currentLocation && Math.abs(currentLocation.lat - startPoint[1]) < 0.0003 && Math.abs(currentLocation.lng - startPoint[0]) < 0.0003) return null;
          return (
            // Modest origin dot (14.08.2026 UX polish; enlarged + flag glyph
            // added 15.08.2026) — a small solid out-blue circle with a white
            // flag icon, matching the "Google-Maps-style" origin-dot
            // precedent but readable as "start/finish" at a glance (no ping
            // animation — a route start is static, not a live position).
            // The outer div is a larger invisible tap target so the visual
            // size doesn't shrink the actual touch area.
            <Marker key={route.id} longitude={startPoint[0]} latitude={startPoint[1]} anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); onRouteSelect && onRouteSelect(route); }}>
              <div className="flex items-center justify-center cursor-pointer" style={{ width: '36px', height: '36px' }}>
                <div
                  className={`flex items-center justify-center rounded-full border-2 border-white transition-all duration-300 ${isSelected ? 'scale-110' : 'scale-90 opacity-80'}`}
                  style={{
                    width: '20px', height: '20px', background: '#007aff',
                    boxShadow: isSelected
                      ? '0 2px 6px rgba(0,122,255,0.45)'
                      : '0 1px 4px rgba(0,0,0,0.25)',
                  }}
                >
                  <Flag size={10} color="#ffffff" fill="#ffffff" strokeWidth={2.5} />
                </div>
              </div>
            </Marker>
          );
        })}

        {/* ── Distinct finish marker — point-to-point routes ONLY (15.08.2026).
            Confirmed before building: the only route type with a genuinely
            different start and end today is commute (`route.variant` is set
            ONLY on commute routes — route.types.ts's own doc comment: "Loop
            routes... leave `variant` undefined"). Commute already has its
            own DestinationMarker at the user-picked destination, so this is
            deliberately gated off for commute (variant !== undefined) —
            otherwise it would render a second, redundant "you're heading
            here" marker on top of the existing one. Every generated loop/
            out-and-back has path[0] === path[last] by construction, so
            isSameCoord already excludes them with zero extra logic — this
            block is future-proofing for any genuinely point-to-point,
            non-commute route (e.g. a curated point-to-point trail), not
            something that fires for today's generated routes. ── */}
        {!isActiveWorkout && visibleRoutes.map(route => {
          if (route.variant !== undefined) return null; // commute — DestinationMarker already covers this
          const startPoint = route.path?.[0];
          const endPoint = route.path?.[route.path.length - 1];
          if (!isFiniteLngLat(startPoint) || !isFiniteLngLat(endPoint)) return null;
          if (isSameCoord(startPoint, endPoint)) return null; // loop/out-and-back — combined marker above covers it
          const isSelected = focusedRoute?.id === route.id;
          return (
            <Marker key={`${route.id}-finish`} longitude={endPoint[0]} latitude={endPoint[1]} anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); onRouteSelect && onRouteSelect(route); }}>
              <div className="flex items-center justify-center cursor-pointer" style={{ width: '36px', height: '36px' }}>
                <div
                  className={`flex items-center justify-center rounded-full border-2 border-white transition-all duration-300 ${isSelected ? 'scale-110' : 'scale-90 opacity-80'}`}
                  style={{
                    width: '20px', height: '20px', background: '#007aff',
                    boxShadow: isSelected
                      ? '0 2px 6px rgba(0,122,255,0.45)'
                      : '0 1px 4px rgba(0,0,0,0.25)',
                  }}
                >
                  <Flag size={10} color="#ffffff" fill="#ffffff" strokeWidth={2.5} />
                </div>
              </div>
            </Marker>
          );
        })}

        {/* ── Facility markers (zoom 14+) ── */}
        {currentZoom >= 14 && facilities.map((f) => {
          if (!visibleLayers?.includes(f.type as LayerType)) return null;
          // Facilities come from a Firestore source where (very rarely)
          // location.lat / location.lng can land as null during a
          // partial document update. Drop those silently — the heatmap
          // tier still represents the same data, and reviving the
          // Mapbox tree after an LngLat throw is expensive.
          if (!isFiniteLatLng(f.location)) return null;
          // Viewport-cull — mirror the partner-marker bounds filter below.
          // The finite-coords gate above runs FIRST so contains() never sees a
          // non-finite pair. Without this, EVERY facility of a visible type in
          // the set mounts a DOM marker at zoom ≥ 14 whether or not it is
          // on-screen — the dense-city OOM driver. Null bounds (pre-first-move)
          // → render, matching the partner path.
          if (viewportBounds && !viewportBounds.contains([f.location.lng, f.location.lat])) return null;
          const isPassive = ['water', 'toilet'].includes(f.type);
          return (
            <Marker key={f.id} longitude={f.location.lng} latitude={f.location.lat} anchor="center"
              onClick={isPassive ? undefined : (e) => { e.originalEvent.stopPropagation(); setSelectedFacility(f); }}>
              <div
                className={`flex items-center justify-center rounded-full ${isPassive ? '' : 'cursor-pointer hover:scale-110 transition-transform'}`}
                style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 2px rgba(255,255,255,0.8)' }}
              >
                {f.type === 'water' ? <Droplet size={18} fill="#0ea5e9" className="text-white" /> : (
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>
                    {f.type === 'toilet' && '🚽'}
                    {f.type === 'gym' && '💪'}
                    {f.type === 'parking' && '🅿️'}
                  </span>
                )}
              </div>
            </Marker>
          );
        })}

        {/* ── Partner markers (Peloton) ──
            High-zoom tier only. Below zoom 15 the heatmap/dots layers above
            represent the same data without DOM cost. Viewport-bounds filter
            ensures we never mount markers for partners off-screen, which
            keeps marker count bounded as the city scales. */}
        {currentZoom >= 15 && visiblePartners
          // Two-stage filter: finite-coords gate FIRST (rejects partial
          // presence docs with null lng/lat), THEN viewport bounds. The
          // bounds check internally calls Mapbox's contains() which is
          // safe with non-finite values but still wastes a call.
          .filter((p) => isFiniteLngLat([p.lng, p.lat]))
          .filter((p) => !viewportBounds || viewportBounds.contains([p.lng, p.lat]))
          .map((p) => (
            <Marker key={p.uid} longitude={p.lng} latitude={p.lat} anchor="center">
              <button
                onClick={() => onPartnerClick?.({ uid: p.uid, name: p.name, personaImageUrl: p.personaImageUrl, lemurStage: p.lemurStage })}
                className="cursor-pointer"
              >
                <PartnerMarker
                  name={p.name}
                  color={p.color}
                  size={34}
                  personaImageUrl={p.personaImageUrl}
                  lemurStage={p.lemurStage}
                />
              </button>
            </Marker>
          ))}

        {/* ── Facility popup ── */}
        {selectedFacility && (
          <Popup longitude={selectedFacility.location.lng} latitude={selectedFacility.location.lat} anchor="bottom" offset={40} onClose={() => setSelectedFacility(null)} closeButton={false} className="z-50">
            <div className="p-3 min-w-[150px] bg-white rounded-xl shadow-xl border border-gray-100 text-right">
              <div className="flex items-center gap-2 mb-2 flex-row-reverse justify-between">
                <div className={`p-1 rounded-lg ${selectedFacility.type === 'water' ? 'bg-blue-100 text-blue-600' : selectedFacility.type === 'toilet' ? 'bg-gray-100 text-gray-600' : selectedFacility.type === 'gym' ? 'bg-orange-100 text-orange-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  {selectedFacility.type === 'water' && '🚰'}
                  {selectedFacility.type === 'toilet' && '🚽'}
                  {selectedFacility.type === 'gym' && '💪'}
                  {selectedFacility.type === 'parking' && '🅿️'}
                </div>
                <h4 className="font-black text-gray-800 text-sm">{selectedFacility.name}</h4>
              </div>
              <p className="text-[10px] font-bold text-gray-400 capitalize text-right">{selectedFacility.type}</p>
              <button
                className="w-full mt-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => setSelectedFacility(null)}
              >
                נווט לכאן
              </button>
            </div>
          </Popup>
        )}
        </>
        )}
      </Map>

      {/* ── AI-themed init skeleton — dissolves into the styled map ─────────
          Sits at z-[50] inside AppMap's local stacking context (above the
          admin button at z-20 and any in-canvas content). Driven by the
          `isVisuallyReady` gate above; AnimatePresence handles the
          scale + blur + fade exit so the user sees one continuous motion
          from "AI is preparing your map" → final clean map. */}
      <MapLoadingSkeleton visible={!isVisuallyReady} />

      {isAdmin && (
        <button
          onClick={() => setShowInfrastructure((prev) => !prev)}
          className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg transition-all ${
            showInfrastructure ? 'bg-amber-500 text-white' : 'bg-white/90 text-gray-500 border border-gray-200'
          }`}
          title="Toggle infrastructure visibility (admin only)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {showInfrastructure ? 'תשתיות: ON' : 'תשתיות: OFF'}
        </button>
      )}
    </div>
  );
}
