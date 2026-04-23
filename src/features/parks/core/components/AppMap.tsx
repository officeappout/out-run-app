'use client';

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import Map, { Source, Layer, Marker, MapRef } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Droplet } from 'lucide-react';
import { Route } from '../types/route.types';
import { fetchRealParks } from '../services/parks.service';
import { useMapStore, LayerType } from '../store/useMapStore';
import { useFacilities } from '../hooks/useFacilities';
import { useCameraController } from '../hooks/useCameraController';
import { Popup } from 'react-map-gl';
import LemurMarker from '@/components/LemurMarker';
import PartnerMarker from './PartnerMarker';

import { registerPinImage, drawPullUpBarIcon, drawDumbbellIcon, drawDotIcon, MINOR_URBAN_TYPES } from './mapPinIcons';
import { applyFitnessMapStyle } from './mapStyleConfig';
import { segmentPathByZone } from '../services/geoUtils';
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
  partnerPositions?: { uid: string; name: string; lat: number; lng: number; color: string; personaImageUrl?: string; lemurStage?: number }[];
  /** Current user's persona ID — determines which lemur character image to show */
  userPersonaId?: string | null;
  /** Callback when a partner marker is tapped */
  onPartnerClick?: (partner: { uid: string; name: string; personaImageUrl?: string; lemurStage?: number }) => void;
  /** Neighborhood-level anchor coordinates to use as initial map center (zoom 14). Falls back to Tel Aviv. */
  initialCenter?: { lat: number; lng: number } | null;
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
  userPersonaId,
  onPartnerClick,
  initialCenter,
}: AppMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const [parks, setParks] = useState<any[]>([]);
  const { setSelectedPark, visibleLayers } = useMapStore();
  const { facilities } = useFacilities();
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [showInfrastructure, setShowInfrastructure] = useState(false);

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
  });

  const visibleRoutes = useMemo(() => {
    return routes.filter((r) => {
      // In admin mode: raw infrastructure segments respect the admin toggle
      if (isAdmin && r.isInfrastructure) return showInfrastructure;
      // In user mode: all routes that arrived via useRouteGeneration are eligible to draw
      return true;
    });
  }, [routes, isAdmin, showInfrastructure]);

  useEffect(() => {
    fetchRealParks().then(setParks);
  }, []);

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

  // ── Register custom pin images once the map is loaded ──
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (!map.hasImage('pin-functional')) registerPinImage(map, 'pin-functional', '#1e3a8a', drawPullUpBarIcon, ratio);
    if (!map.hasImage('pin-default')) registerPinImage(map, 'pin-default', '#00BAF7', drawDumbbellIcon, ratio);
    if (!map.hasImage('pin-minor')) registerPinImage(map, 'pin-minor', '#94a3b8', drawDotIcon, ratio);
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
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: zoom!,
          duration: 500,
        });
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
      .map(route => ({
        type: 'Feature',
        properties: { id: route.id, isFocused: focusedRoute?.id === route.id, isInfrastructure: route.isInfrastructure || false },
        geometry: { type: 'LineString', coordinates: route.path },
      }));
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

  const handleMapLoad = (e: any) => {
    const rawMap = e?.target || mapRef.current?.getMap?.() || mapRef.current;
    if (!rawMap || typeof rawMap.getStyle !== 'function') return;

    // Custom GeoJSON layer IDs that must never have their text-field overwritten by the
    // Hebrew label pass — doing so would blank out cluster counts and custom icons.
    const CUSTOM_LAYER_IDS = new Set([
      'park-clusters-glow', 'park-clusters', 'park-pins', 'park-minor-pins', 'park-cluster-count',
      'routes-background', 'routes-active-glow', 'routes-active-outline', 'routes-active',
      'live-path-trace', 'ghost-path-glow', 'ghost-path-line', 'sim-walk-trail',
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

    if (rawMap.isStyleLoaded()) applyFitnessMapStyle(rawMap);
    else rawMap.once('style.load', () => applyFitnessMapStyle(rawMap));
    rawMap.on('style.load', () => applyFitnessMapStyle(rawMap));

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
        onZoomEnd={(e) => setCurrentZoom(e.viewState.zoom)}
        initialViewState={
          initialCenter
            ? { longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: 14 }
            : { longitude: 34.7818, latitude: 32.0853, zoom: 13 }
        }
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        mapStyle="mapbox://styles/mapbox/light-v11"
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

        {/* ── Simulation walk trail — DISABLED (was distracting orange dashes) ── */}

        {/* ── Parks: Clustered GeoJSON Source ── */}
        <Source id="parks-clustered" type="geojson" data={parksGeoJSON} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
          <Layer id="park-clusters-glow" type="circle" filter={PARK_CLUSTERS_GLOW.filter} paint={PARK_CLUSTERS_GLOW.paint as any} />
          <Layer id="park-clusters" type="circle" filter={PARK_CLUSTERS.filter} paint={PARK_CLUSTERS.paint as any} />
          <Layer id="park-pins" type="symbol" filter={PARK_PINS.filter} minzoom={PARK_PINS.minzoom} layout={PARK_PINS.layout as any} />
          <Layer id="park-minor-pins" type="symbol" filter={PARK_MINOR_PINS.filter} minzoom={PARK_MINOR_PINS.minzoom} layout={PARK_MINOR_PINS.layout as any} />
          <Layer id="park-cluster-count" type="symbol" filter={PARK_CLUSTER_COUNT.filter} layout={PARK_CLUSTER_COUNT.layout as any} paint={PARK_CLUSTER_COUNT.paint as any} />
        </Source>

        {/* ── User marker — Lemur avatar (zoom-scaled) ──────────────────── */}
        {currentLocation && (() => {
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
                  <LemurMarker size={52} personaId={userPersonaId} />
                )}
              </div>
            </Marker>
          );
        })()}

        {/* ── Destination marker ── */}
        {destinationMarker && (
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
          if (!startPoint) return null;
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

        {/* ── Partner markers (Peloton) ── */}
        {partnerPositions.map((p) => (
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
