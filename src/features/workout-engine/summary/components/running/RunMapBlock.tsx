'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// 1. טעינת תמיכה בעברית (RTL) - חובה לעברית תקינה
if (typeof window !== 'undefined' && !mapboxgl.getRTLTextPluginStatus()) {
  try {
    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      null,
      true
    );
  } catch (err) {
    console.warn('[RunMapBlock] RTL plugin error:', err);
  }
}

// Dynamic import to avoid SSR issues
const Map = dynamic(() => import('react-map-gl').then((mod) => mod.default), {
  ssr: false,
});

// Import Source and Layer directly (they don't need SSR protection)
import { Source, Layer, MapRef } from 'react-map-gl';

interface RunMapBlockProps {
  routeCoords: number[][]; // [[lng, lat], ...]
  startCoord?: number[]; // [lng, lat]
  endCoord?: number[]; // [lng, lat]
}

export default function RunMapBlock({ routeCoords, startCoord, endCoord }: RunMapBlockProps) {
  const [mounted, setMounted] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    setMounted(true);
    // Get Mapbox token from environment
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
    setMapboxToken(token);
  }, []);

  if (!mounted || !mapboxToken) {
    return (
      <div
        className="w-full h-full bg-gray-200 flex items-center justify-center"
        style={{ fontFamily: 'Assistant, sans-serif' }}
      >
        <p className="text-gray-400">טוען מפה...</p>
      </div>
    );
  }

  // If no route coords, show empty map
  if (routeCoords.length === 0) {
    return (
      <div
        className="w-full h-full bg-gray-200 flex items-center justify-center"
        style={{ fontFamily: 'Assistant, sans-serif' }}
      >
        <p className="text-gray-400">אין נתוני מסלול</p>
      </div>
    );
  }

  // Calculate bounds
  const lngs = routeCoords.map((coord) => coord[0]);
  const lats = routeCoords.map((coord) => coord[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;

  // Fit bounds when map loads
  useEffect(() => {
    if (isMapLoaded && mapRef.current && routeCoords.length > 1) {
      try {
        const bounds: [number, number, number, number] = [
          minLng,
          minLat,
          maxLng,
          maxLat,
        ];
        mapRef.current.fitBounds(bounds, {
          padding: 40,
          duration: 0,
        });
      } catch (err) {
        console.warn('[RunMapBlock] Could not fit bounds:', err);
      }
    }
  }, [isMapLoaded, minLng, minLat, maxLng, maxLat, routeCoords.length]);

  // Convert routeCoords to GeoJSON LineString format
  const geojsonData = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: routeCoords,
    },
  };

  const handleMapLoad = (e: any) => {
    setIsMapLoaded(true);
    
    // Force Hebrew labels on all layers
    try {
      const map = e.target;
      if (map && map.getStyle) {
        const applyHebrewLabels = () => {
          try {
            const style = map.getStyle();
            if (!style || !style.layers) return;
            
            style.layers.forEach((layer: any) => {
              try {
                if (layer.layout && layer.layout['text-field']) {
                  map.setLayoutProperty(layer.id, 'text-field', [
                    'coalesce',
                    ['get', 'name_he'],
                    ['get', 'name:he'],
                    ['get', 'name']
                  ]);
                }
              } catch (err) {
                // Ignore per-layer errors
              }
            });
          } catch (err) {
            console.warn('[RunMapBlock] Could not apply Hebrew labels:', err);
          }
        };
        
        // Apply immediately
        applyHebrewLabels();
        
        // Reapply on style changes
        map.on('style.load', applyHebrewLabels);
        map.on('data', () => {
          setTimeout(applyHebrewLabels, 100);
        });
      }
    } catch (err) {
      console.warn('[RunMapBlock] Map load handler error:', err);
    }
  };

  return (
    <div
      className="w-full h-full relative"
      style={{ fontFamily: 'Assistant, sans-serif' }}
    >
      {!isMapLoaded && (
        <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-10">
          <p className="text-gray-400">טוען מפה...</p>
        </div>
      )}
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          longitude: centerLng,
          latitude: centerLat,
          zoom: 14,
          bearing: 0,
          pitch: 0,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={mapboxToken}
        locale="he"
        interactive={false}
      >
          {/* Route Line */}
          {routeCoords.length > 1 && (
            <Source id="route" type="geojson" data={geojsonData}>
              <Layer
                id="route-line"
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#00ADEF',
                  'line-width': 5,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Start Marker */}
          {startCoord && (
            <Source
              id="start-marker"
              type="geojson"
              data={{
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: startCoord,
                },
                properties: {},
              }}
            >
              <Layer
                id="start-circle"
                type="circle"
                paint={{
                  'circle-radius': 8,
                  'circle-color': '#10B981',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                }}
              />
            </Source>
          )}

          {/* End Marker */}
          {endCoord && (
            <Source
              id="end-marker"
              type="geojson"
              data={{
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: endCoord,
                },
                properties: {},
              }}
            >
              <Layer
                id="end-circle"
                type="circle"
                paint={{
                  'circle-radius': 8,
                  'circle-color': '#EF4444',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                }}
              />
            </Source>
          )}
        </Map>
    </div>
  );
}
