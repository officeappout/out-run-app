'use client';

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import Map, { Source, Layer, Marker, MapRef } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Droplet } from 'lucide-react';
import { Route } from '../types/route.types';
import { fetchRealParks } from '../services/parks.service';
import { useMapStore, LayerType, PartnerActivityFilter } from '../store/useMapStore';
import { useFacilities } from '../hooks/useFacilities';
import { useCameraController } from '../hooks/useCameraController';
import { useWalkToRoute } from '../hooks/useWalkToRoute';
import { Popup } from 'react-map-gl';
import LemurMarker from '@/components/LemurMarker';
import PartnerMarker from './PartnerMarker';
import ParkPhotoMarker from './ParkPhotoMarker';
import DestinationMarker from './DestinationMarker';

import { registerPinImage, registerArrowTipImage, drawPullUpBarIcon, drawDumbbellIcon, drawDotIcon, MINOR_URBAN_TYPES } from './mapPinIcons';
import { applyFitnessMapStyle } from './mapStyleConfig';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { segmentPathByZone, bearingBetween } from '../services/geoUtils';
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
  PARK_CLUSTERS_GLOW, PARK_CLUSTERS, PARK_PINS, PARK_MINOR_PINS, PARK_CLUSTER_COUNT,
} from './mapLayersConfig';

if (typeof window !== 'undefined' && !mapboxgl.getRTLTextPluginStatus()) {
  try {
    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      (error) => { if (error) console.error('RTL Error:', error); },
      true
    );
  } catch (err) { }
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
  mapMode,
  navigationTurns,
  activityType,
}: AppMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  // ── Map paint readiness gate ──────────────────────────────────────────
  // Drives the AI-themed `MapLoadingSkeleton` overlay. False until BOTH:
  //   1. The Mapbox style has finished parsing (so the declutter pass
  //      ran and the noisy POI / transit / minor-road labels are gone).
  //   2. The first `idle` event has fired (so tiles for the current
  //      viewport have rendered and no animation is in flight).
  // Combined, this guarantees the skeleton dissolves into a clean,
  // styled, settled map — never the raw streets-v12 default with a
  // visible style swap mid-paint.
  //
  // The lazy initializer reads `mapHasInitializedInSession` (module
  // scope) so warm re-mounts (tab switch back to /map) start with the
  // skeleton already disabled. Cold starts initialise it to `false`,
  // the skeleton renders, and `markReady` below flips both the React
  // state AND the module flag together — so the very next remount in
  // the same session skips the skeleton entirely.
  const [isVisuallyReady, setIsVisuallyReady] = useState(() => mapHasInitializedInSession);

  const [parks, setParks] = useState<any[]>([]);
  const { setSelectedPark, visibleLayers, selectedPark } = useMapStore();
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
  const { facilities } = useFacilities();
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);
  const [currentZoom, setCurrentZoom] = useState(13);
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
    features: activityFilteredPositions.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { uid: p.uid },
    })),
  }), [activityFilteredPositions]);

  const visiblePartnersGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: visiblePartners.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { uid: p.uid },
    })),
  }), [visiblePartners]);

  useEffect(() => {
    fetchRealParks().then(setParks);
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

  // ── Skeleton dissolve trigger ─────────────────────────────────────────
  // Flips `isVisuallyReady` true on the first Mapbox `idle` event after
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
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    if (mapHasInitializedInSession) return; // warm mount — skeleton stays hidden, no listener needed
    const map = mapRef.current.getMap();
    if (!map) return;

    const markReady = () => {
      // Persist the "ready" state at module scope so the next AppMap
      // mount in this session (tab switch / soft nav) starts with the
      // skeleton already disabled and skips this whole effect.
      mapHasInitializedInSession = true;
      setIsVisuallyReady(true);
    };

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

    const safetyTimeout = setTimeout(markReady, 1800);

    return () => {
      clearTimeout(safetyTimeout);
      try { map.off('render', markReady); } catch { /* map may be gone */ }
      try { map.off('idle', markReady); } catch { /* map may be gone */ }
      try { map.off('style.load', armReadyListeners); } catch { /* */ }
    };
  }, [isMapLoaded]);

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
        const coords = (route.displayPath && route.displayPath.length > 1)
          ? route.displayPath
          : route.path;
        return {
          type: 'Feature',
          properties: { id: route.id, isFocused: focusedRoute?.id === route.id, isInfrastructure: route.isInfrastructure || false },
          geometry: { type: 'LineString', coordinates: coords },
        };
      });
    return { type: 'FeatureCollection', features };
  }, [visibleRoutes, focusedRoute]);

  const hasZones = livePathZones && livePathZones.some((z) => z != null);

  const livePathGeoJSON = useMemo(() => {
    if (!livePath || livePath.length < 2) return null;
    if (!hasZones) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { zoneType: '_default' }, geometry: { type: 'LineString', coordinates: livePath } }] };
    }
    return segmentPathByZone(livePath, livePathZones!);
  }, [livePath, livePathZones, hasZones]);

  // Ghost path = only the segment AHEAD of the user (from nearest point onward).
  // The slice is computed by scanning the planned path for the coordinate closest
  // to the current position (L1 distance is fast and sufficient for this purpose).
  // The segment BEHIND is already covered by the livePathGeoJSON trace.
  const ghostPathGeoJSON = useMemo(() => {
    if (!isActiveWorkout || !focusedRoute?.path || focusedRoute.path.length < 2) return null;

    let startIdx = 0;
    if (currentLocation) {
      let minDist = Infinity;
      for (let i = 0; i < focusedRoute.path.length; i++) {
        const [lng, lat] = focusedRoute.path[i];
        const d = Math.abs(lat - currentLocation.lat) + Math.abs(lng - currentLocation.lng);
        if (d < minDist) { minDist = d; startIdx = i; }
      }
    }

    const aheadPath = focusedRoute.path.slice(startIdx);
    if (aheadPath.length < 2) return null;

    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: aheadPath } }],
    };
  }, [isActiveWorkout, focusedRoute, currentLocation]);

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
    const endIdx   = Math.min(path.length - 1, idx + NAV_ARROW_PATH_RADIUS);
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
      'live-path-trace', 'ghost-path-glow', 'ghost-path-line', 'sim-walk-trail',
      // Navigation ground visuals (curve + tip) — exempt from the Hebrew
      // label pass so it doesn't try to set text-field on a line/icon layer.
      'nav-arrow-line-glow', 'nav-arrow-line', 'nav-arrow-tip',
    ]);

    let hebrewDebounce: ReturnType<typeof setTimeout> | null = null;
    const applyHebrewLabels = () => {
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
      } catch (err) { console.warn('Could not set Hebrew labels:', err); }
    };
    const debouncedHebrew = () => {
      if (hebrewDebounce) clearTimeout(hebrewDebounce);
      hebrewDebounce = setTimeout(applyHebrewLabels, 50);
    };

    applyHebrewLabels();
    rawMap.on('style.load', applyHebrewLabels);
    rawMap.on('sourcedata', debouncedHebrew);

    // ── Fitness declutter — timing fix ──────────────────────────────────────
    // Diagnostic confirmed: isStyleLoaded() is false during the onLoad callback
    // because Mapbox fires onLoad when the map container is ready, not when all
    // style tiles are painted. Strategy: register on('style.load') for both the
    // initial load and any future style swaps, then call immediately only if the
    // style is already parsed (rare on first load, common on hot-reload).
    const runDeclutter = () => applyFitnessMapStyle(rawMap, 'style.load');
    rawMap.on('style.load', runDeclutter);
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
  };

  return (
    <div className="w-full h-full relative bg-[#f3f4f6] overflow-hidden">
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        onZoom={(e) => setCurrentZoom(e.viewState.zoom)}
        onZoomEnd={(e) => {
          setCurrentZoom(e.viewState.zoom);
          setViewportBounds(mapRef.current?.getBounds() ?? null);
        }}
        onMoveEnd={() => setViewportBounds(mapRef.current?.getBounds() ?? null)}
        initialViewState={
          initialCenter
            ? { longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: 14 }
            : { longitude: 34.7818, latitude: 32.0853, zoom: 13 }
        }
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
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
        {/* ── Route layers ── */}
        {!isActiveWorkout && visibleLayers?.includes('routes') && (
          <Source id="routes" type="geojson" data={routesGeoJSON as any}>
            <Layer id="routes-background" type="line" paint={ROUTES_BACKGROUND.paint as any} layout={ROUTES_BACKGROUND.layout} />
            <Layer id="routes-active-glow" type="line" filter={ROUTES_ACTIVE_GLOW.filter} paint={ROUTES_ACTIVE_GLOW.paint as any} layout={ROUTES_ACTIVE_GLOW.layout} />
            <Layer id="routes-active-outline" type="line" filter={ROUTES_ACTIVE_OUTLINE.filter} paint={ROUTES_ACTIVE_OUTLINE.paint as any} layout={ROUTES_ACTIVE_OUTLINE.layout} />
            <Layer id="routes-active" type="line" filter={ROUTES_ACTIVE.filter} paint={ROUTES_ACTIVE.paint as any} layout={ROUTES_ACTIVE.layout} />
          </Source>
        )}

        {/* ── Active workout paths ───────────────────────────────────────── */}
        {isActiveWorkout && (
          <>
            {/* Trace path: where the user has already been — faint, drawn first = bottom */}
            {livePathGeoJSON && (
              <Source id="live-path" type="geojson" data={livePathGeoJSON as any}>
                <Layer id="live-path-trace" type="line" paint={TRACE_PATH_LINE.paint as any} layout={TRACE_PATH_LINE.layout} />
              </Source>
            )}

            {/* Ghost path: the full planned route — vibrant cyan goal line, drawn on top */}
            {ghostPathGeoJSON && (
              <Source id="ghost-path" type="geojson" data={ghostPathGeoJSON as any}>
                <Layer id="ghost-path-glow" type="line" paint={GHOST_PATH_GLOW.paint as any} layout={GHOST_PATH_GLOW.layout} />
                <Layer id="ghost-path-line" type="line" paint={GHOST_PATH_LINE.paint as any} layout={GHOST_PATH_LINE.layout} />
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
          <Source id="partner-presence" type="geojson" data={presenceGeoJSON}>
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
        {isFiniteLatLng(currentLocation) && (() => {
          // Scale the lemur based on zoom. CSS transform keeps the anchor point stable
          // (no DOM reflow) and the 0.2s transition makes the resize feel organic.
          // Below zoom 10 we replace the avatar with a compact blue pulse dot.
          const lemurScale = currentZoom >= 15 ? 1 : currentZoom >= 10 ? 0.67 : 0;
          const showPulseDot = currentZoom < 10;

          if (showPulseDot) {
            return (
              <Marker longitude={currentLocation.lng} latitude={currentLocation.lat} anchor="center">
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
            <Marker longitude={currentLocation.lng} latitude={currentLocation.lat} anchor="center">
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
                    {/* Lemur with pulsing cyan halo */}
                    <div className="relative">
                      <div
                        className="absolute rounded-full animate-ping"
                        style={{ inset: '-6px', background: 'rgba(0,229,255,0.18)' }}
                      />
                      <div
                        className="absolute rounded-full"
                        style={{ inset: '-2px', border: '2px solid rgba(0,229,255,0.5)' }}
                      />
                      <LemurMarker size={52} personaId={userPersonaId} />
                    </div>
                  </div>
                ) : (
                  // Idle mode: bright cyan ring + soft outer glow distinguishes
                  // the user's marker from muted partner markers at a glance.
                  <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
                    {/* Slow subtle pulse */}
                    <div
                      className="absolute rounded-full animate-ping"
                      style={{ inset: -6, background: 'rgba(0,229,255,0.12)', animationDuration: '2.8s' }}
                    />
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

        {/* ── Route start markers ── */}
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
            <Marker key={route.id} longitude={startPoint[0]} latitude={startPoint[1]} anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); onRouteSelect && onRouteSelect(route); }}>
              <div
                className={`flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer ${isSelected ? 'scale-110' : 'scale-90 opacity-80'}`}
                style={{
                  width: '28px', height: '28px', background: 'rgba(255,255,255,0.95)',
                  boxShadow: isSelected
                    ? '0 2px 8px rgba(0,122,255,0.35), 0 0 0 2px rgba(0,122,255,0.3)'
                    : '0 1px 4px rgba(0,0,0,0.15), 0 0 0 2px rgba(255,255,255,0.8)',
                }}
              >
                <div className={`w-3 h-3 rounded-full ${isSelected ? 'bg-[#007aff]' : 'bg-gray-400'}`} />
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
