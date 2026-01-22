'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import Map, { Source, Layer, Marker, MapRef } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Droplet } from 'lucide-react';
import { Route } from '../types/route.types';
import { fetchRealParks } from '../services/parks.service';
import { useMapStore } from '../store/useMapStore';
import { MapLayersControl } from './MapLayersControl';
import { useFacilities } from '../hooks/useFacilities';
import { Popup } from 'react-map-gl';
import LemurMarker from '@/components/LemurMarker';

// 1. טעינת תמיכה בעברית (RTL) - חובה לעברית תקינה
if (typeof window !== 'undefined' && !mapboxgl.getRTLTextPluginStatus()) {
  try {
    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      (error) => { if (error) console.error('RTL Error:', error); },
      true
    );
  } catch (err) { }
}

// Read Mapbox token from env with a safe fallback so missing keys don't crash builds
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw';

interface AppMapProps {
  routes?: Route[];
  currentLocation?: { lat: number; lng: number } | null;
  focusedRoute?: Route | null;
  selectedRoute?: Route | null;
  onRouteSelect?: (route: Route) => void;
  livePath?: [number, number][];
  isActiveWorkout?: boolean;
  showCarousel?: boolean;
  loadingRouteIds?: Set<string>;
  destinationMarker?: { lat: number; lng: number } | null;
  isNavigationMode?: boolean;
  userBearing?: number;
}

export default function AppMap({
  routes = [],
  currentLocation,
  focusedRoute,
  selectedRoute,
  onRouteSelect,
  livePath,
  isActiveWorkout,
  destinationMarker,
  isNavigationMode = false,
  userBearing = 0
}: AppMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const hasInitialZoomed = useRef(false); // ✅ Track one-time auto-zoom

  const [parks, setParks] = useState<any[]>([]);
  const { setSelectedPark, visibleLayers } = useMapStore();
  const { facilities } = useFacilities();
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);

  useEffect(() => {
    const loadParks = async () => {
      const realParks = await fetchRealParks();
      setParks(realParks);
    };
    loadParks();
  }, []);

  // ✅ ONE-TIME AUTO-ZOOM: Zoom to user location when first coordinates arrive
  useEffect(() => {
    if (
      hasInitialZoomed.current ||
      !currentLocation ||
      !mapRef.current ||
      !isMapLoaded ||
      focusedRoute ||
      isActiveWorkout ||
      destinationMarker
    ) {
      return;
    }

    hasInitialZoomed.current = true;
    
    mapRef.current.flyTo({
      center: [currentLocation.lng, currentLocation.lat],
      zoom: 15,
      pitch: 45,
      duration: 2000,
      essential: true
    });
  }, [currentLocation, isMapLoaded, focusedRoute, isActiveWorkout, destinationMarker]);

  // Navigation mode camera following
  useEffect(() => {
    if (isNavigationMode && currentLocation && mapRef.current && isMapLoaded) {
      mapRef.current.easeTo({
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 18.5,
        pitch: 60,
        bearing: userBearing,
        padding: { top: 0, bottom: 400, left: 0, right: 0 },
        duration: 1000,
        easing: (t) => t,
        essential: true
      });
    }
  }, [isNavigationMode, currentLocation, userBearing, isMapLoaded]);

  // Smooth camera following during active workout (industry-standard GPS tracking)
  useEffect(() => {
    if (isActiveWorkout && currentLocation && mapRef.current && isMapLoaded && !isNavigationMode) {
      // Use easeTo for smooth, continuous following (like Strava/Nike)
      mapRef.current.easeTo({
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 17, // Slightly zoomed in for active tracking
        duration: 500, // Smooth 500ms transition
        easing: (t) => t * (2 - t), // Ease-out curve for natural movement
        essential: true, // Continue even if user interacts
      });
    }
  }, [isActiveWorkout, currentLocation, isMapLoaded, isNavigationMode]);

  useEffect(() => {
    if (destinationMarker && mapRef.current && isMapLoaded && !focusedRoute) {
      mapRef.current.flyTo({
        center: [destinationMarker.lng, destinationMarker.lat],
        zoom: 15,
        essential: true,
        duration: 2000
      });
    }
  }, [destinationMarker, isMapLoaded, focusedRoute]);

  useEffect(() => {
    const targetPath = isActiveWorkout ? livePath : focusedRoute?.path;

    if (targetPath && targetPath.length > 1 && mapRef.current && isMapLoaded && !isNavigationMode) {
      try {
        const validCoords = targetPath.filter(c =>
          Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1])
        );

        if (validCoords.length < 2) return;

        const bounds = validCoords.reduce((bounds, coord) => {
          return [
            Math.min(bounds[0], coord[0]),
            Math.min(bounds[1], coord[1]),
            Math.max(bounds[2], coord[0]),
            Math.max(bounds[3], coord[1])
          ];
        }, [validCoords[0][0], validCoords[0][1], validCoords[0][0], validCoords[0][1]]);

        mapRef.current.fitBounds(bounds as [number, number, number, number], {
          padding: 100,
          duration: 1000
        });
      } catch (err) {
        console.warn("Could not fit bounds", err);
      }
    }
  }, [focusedRoute, livePath, isActiveWorkout, isMapLoaded]);

  const routesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: routes
        .filter(r => r.path && r.path.length > 1)
        .map(route => ({
          type: 'Feature',
          properties: {
            id: route.id,
            isFocused: focusedRoute?.id === route.id
          },
          geometry: {
            type: 'LineString',
            coordinates: route.path
          }
        }))
    };
  }, [routes, focusedRoute]);

  const livePathGeoJSON = useMemo(() => {
    if (!livePath || livePath.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: livePath
      }
    };
  }, [livePath]);

  const handleMapLoad = (e: any) => {
    // Mark map as loaded only when style is ready
    const map = mapRef.current || e?.target;
    if (!map || typeof map.getStyle !== 'function') return;

    const applyHebrewLabels = () => {
      try {
        const style = map.getStyle();
        if (!style || !style.layers) {
          return;
        }

        // Force Hebrew labels for all symbol layers
        style.layers.forEach((layer: any) => {
          try {
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
              // Set Hebrew-first text field with fallbacks
              map.setLayoutProperty(layer.id, 'text-field', [
                'coalesce',
                ['get', 'name_he'],
                ['get', 'name:he'],
                ['get', 'name_en'],
                ['get', 'name']
              ]);
            }
          } catch {
            // Ignore per-layer errors to avoid crashing map
          }
        });
      } catch (err) {
        console.warn('Could not set Hebrew labels:', err);
      }
    };

    // Apply Hebrew labels immediately
    applyHebrewLabels();

    // Also listen for style changes to reapply Hebrew labels
    map.on('style.load', applyHebrewLabels);
    
    // Also reapply when data loads (for dynamic label updates)
    map.on('data', () => {
      // Debounce to avoid excessive calls
      setTimeout(applyHebrewLabels, 100);
    });

    setIsMapLoaded(true);
  };

  return (
    <div className="w-full h-full relative bg-[#f3f4f6] overflow-hidden">
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          longitude: 34.7818,
          latitude: 32.0853,
          zoom: 13
        }}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        locale="he"
        onClick={() => onRouteSelect && focusedRoute && onRouteSelect(null as any)}
      >
        {isMapLoaded && (
        <>
        <MapLayersControl />

        {/* 4. מסלולים מתוכננים - עם צבעים דינמיים ✅ */}
        {!isActiveWorkout && visibleLayers?.has('routes') && (
          <Source id="routes" type="geojson" data={routesGeoJSON as any}>
            {/* שכבת מסגרת לבנה למסלול (Outline) - רק למסלול ממוקד */}
            <Layer
                id="routes-outline"
                type="line"
                paint={{
                    'line-color': '#ffffff',
                    'line-width': [
                      'case',
                      ['boolean', ['get', 'isFocused'], false],
                      8,    // Outline width for focused route
                      0     // No outline for unfocused routes
                    ],
                    'line-opacity': [
                      'case',
                      ['boolean', ['get', 'isFocused'], false],
                      0.8,  // Visible outline for focused
                      0     // Invisible for unfocused
                    ]
                }}
            />
            {/* ✅ המסלול עצמו - צבעים דינמיים! */}
            <Layer
              id="routes-line"
              type="line"
              paint={{
                // ✅ FIX: כחול אם focused, אפור אם לא
                'line-color': [
                  'case',
                  ['boolean', ['get', 'isFocused'], false],
                  '#3b82f6',  // 🔵 כחול בהיר - המסלול שנבחר
                  '#d1d5db'   // ⚪ אפור בהיר - מסלולים אחרים
                ],
                // ✅ עביה יותר אם focused
                'line-width': [
                  'case',
                  ['boolean', ['get', 'isFocused'], false],
                  6,    // עבה יותר כשנבחר
                  4     // דק יותר כשלא נבחר
                ],
                // ✅ שקיפות דינמית
                'line-opacity': [
                  'case',
                  ['boolean', ['get', 'isFocused'], false],
                  1,     // מלא כשנבחר
                  0.6    // חצי שקוף כשלא נבחר
                ]
              }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {/* 5. מסלול חי - כחול חזק */}
        {isActiveWorkout && livePathGeoJSON && (
          <Source id="live-path" type="geojson" data={livePathGeoJSON as any}>
            <Layer
                id="live-path-outline"
                type="line"
                paint={{
                    'line-color': '#ffffff',
                    'line-width': 9,
                    'line-opacity': 0.6
                }}
            />
            <Layer
              id="live-path-line"
              type="line"
              paint={{
                'line-color': '#2563eb',
                'line-width': 6,
                'line-opacity': 1
              }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {/* Parks Markers */}
        {parks.map((park) => {
          if (!park.location || !park.location.lat || !park.location.lng) return null;
          return (
            <Marker
              key={park.id}
              longitude={Number(park.location.lng)}
              latitude={Number(park.location.lat)}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedPark(park);
              }}
            >
              <div className="group cursor-pointer relative">
                <div className="bg-blue-600 p-2 rounded-full shadow-lg shadow-blue-500/50 transform transition-transform group-hover:scale-125 border-2 border-white">
                  <MapPin size={24} color="white" fill="white" />
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {park.name}
                </div>
              </div>
            </Marker>
          );
        })}

        {/* 6. סמן המשתמש - Lemur Avatar */}
        {currentLocation && (
          <Marker
            longitude={currentLocation.lng}
            latitude={currentLocation.lat}
            anchor="center"
          >
            {isNavigationMode ? (
              <div
                className="relative flex items-center justify-center w-16 h-16"
                style={{ transform: `rotate(${userBearing}deg)` }}
              >
                <div className="absolute w-12 h-12 bg-blue-500 rounded-full opacity-20 animate-ping" />
                <div className="relative w-10 h-10 bg-[#2563eb] border-4 border-white rounded-full shadow-2xl flex items-center justify-center z-20">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-white transform -rotate-90" />
                </div>
              </div>
            ) : (
              <LemurMarker size={50} />
            )}
          </Marker>
        )}

        {destinationMarker && (
          <Marker
            longitude={destinationMarker.lng}
            latitude={destinationMarker.lat}
            anchor="bottom"
          >
            <div className="flex flex-col items-center">
              <div className="bg-purple-600 p-2 rounded-full shadow-lg shadow-purple-500/50 animate-bounce border-2 border-white">
                <MapPin size={24} color="white" fill="white" />
              </div>
              <div className="w-2 h-2 bg-purple-600 rounded-full blur-[2px] mt-1"></div>
            </div>
          </Marker>
        )}

        {!isActiveWorkout && routes.map(route => {
          const startPoint = route.path?.[0];
          if (!startPoint) return null;
          const isSelected = focusedRoute?.id === route.id;

          // Hide extra start marker if it overlaps with the user's current location
          if (
            isSelected &&
            currentLocation &&
            Math.abs(currentLocation.lat - startPoint[1]) < 0.0003 &&
            Math.abs(currentLocation.lng - startPoint[0]) < 0.0003
          ) {
            return null;
          }

          return (
            <Marker
              key={route.id}
              longitude={startPoint[0]}
              latitude={startPoint[1]}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onRouteSelect && onRouteSelect(route);
              }}
            >
              <div className={`transform transition-all duration-300 ${isSelected ? 'scale-125' : 'scale-75 opacity-70'}`}>
                <div className={`w-4 h-4 rounded-full border-2 border-white ${isSelected ? 'bg-blue-600' : 'bg-gray-500'}`}></div>
              </div>
            </Marker>
          )
        })}

        {/* Facilities Layers */}
        {facilities.map((f) => {
          if (!visibleLayers?.has(f.type as any)) return null;

          const isPassive = ['water', 'toilet'].includes(f.type);

          return (
            <Marker
              key={f.id}
              longitude={f.location.lng}
              latitude={f.location.lat}
              anchor="center"
              onClick={isPassive ? undefined : (e) => {
                e.originalEvent.stopPropagation();
                setSelectedFacility(f);
              }}
            >
              <div
                style={{
                  opacity: 0.8,
                  width: '12px',
                  height: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'translate(-50%, -50%)'
                }}
                className={isPassive ? '' : 'cursor-pointer hover:scale-125 transition-transform'}
              >
                {f.type === 'water' ? (
                  <Droplet
                    size={14}
                    fill="#0ea5e9"
                    className="text-white drop-shadow-md" 
                    style={{ width: '14px', height: '14px' }}
                  />
                ) : (
                  <span style={{ fontSize: '14px', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>
                    {f.type === 'toilet' && '🚽'}
                    {f.type === 'gym' && '💪'}
                    {f.type === 'parking' && '🅿️'}
                  </span>
                )}
              </div>
            </Marker>
          );
        })}

        {selectedFacility && (
          <Popup
            longitude={selectedFacility.location.lng}
            latitude={selectedFacility.location.lat}
            anchor="bottom"
            offset={40}
            onClose={() => setSelectedFacility(null)}
            closeButton={false}
            className="z-50"
          >
            <div className="p-3 min-w-[150px] bg-white rounded-xl shadow-xl border border-gray-100 text-right">
              <div className="flex items-center gap-2 mb-2 flex-row-reverse justify-between">
                 <div className={`p-1 rounded-lg ${selectedFacility.type === 'water' ? 'bg-blue-100 text-blue-600' :
                  selectedFacility.type === 'toilet' ? 'bg-gray-100 text-gray-600' :
                    selectedFacility.type === 'gym' ? 'bg-orange-100 text-orange-600' :
                      'bg-indigo-100 text-indigo-600'
                  }`}>
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
                onClick={() => {
                  setSelectedFacility(null);
                }}
              >
                נווט לכאן
              </button>
            </div>
          </Popup>
        )}
        </>
        )}
      </Map>
    </div>
  );
}