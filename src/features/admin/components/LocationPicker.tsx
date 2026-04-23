'use client';

import * as React from 'react';
import Map, { Marker, Source, Layer, MapLayerMouseEvent } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, AlertTriangle } from 'lucide-react';

// ── Geo helpers (no external deps) ────────────────────────────────────

function createCirclePolygon(
  center: { lat: number; lng: number },
  radiusKm: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const lat = center.lat + (dy / 111.32);
    const lng = center.lng + (dx / (111.32 * Math.cos((center.lat * Math.PI) / 180)));
    coords.push([lng, lat]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
): boolean {
  const ring = polygon.geometry.coordinates[0];
  if (!ring || ring.length < 3) return true;
  let inside = false;
  const x = point.lng;
  const y = point.lat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Props ─────────────────────────────────────────────────────────────

interface LocationPickerProps {
  value: { lat: number; lng: number };
  onChange: (value: { lat: number; lng: number }) => void;
  /** GeoJSON polygon to render as boundary overlay. Pass null/undefined to disable. */
  boundaryGeoJSON?: GeoJSON.Feature<GeoJSON.Polygon> | null;
  /** Called when pin placement changes in/out-of-bounds status */
  onOutOfBounds?: (isOutside: boolean) => void;
  /** When true, prevents onChange from firing for out-of-bounds clicks */
  enforceStrict?: boolean;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function LocationPicker({
  value,
  onChange,
  boundaryGeoJSON,
  onOutOfBounds,
  enforceStrict = false,
}: LocationPickerProps) {
  const mapRef = React.useRef<MapRef>(null);
  const [outOfBounds, setOutOfBounds] = React.useState(false);
  const [showWarning, setShowWarning] = React.useState(false);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const newPoint = { lat: event.lngLat.lat, lng: event.lngLat.lng };

    if (boundaryGeoJSON) {
      const isOutside = !isPointInPolygon(newPoint, boundaryGeoJSON);
      setOutOfBounds(isOutside);
      onOutOfBounds?.(isOutside);

      if (isOutside) {
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 4000);
        if (enforceStrict) return;
      }
    }

    onChange(newPoint);
  };

  React.useEffect(() => {
    if (boundaryGeoJSON && value) {
      const isOutside = !isPointInPolygon(value, boundaryGeoJSON);
      setOutOfBounds(isOutside);
      onOutOfBounds?.(isOutside);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryGeoJSON]);

  const handleLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && (layer.layout as any)?.['text-field']) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]);
      }
    }
  }, []);

  const boundaryFillLayer: any = {
    id: 'authority-boundary-fill',
    type: 'fill',
    paint: {
      'fill-color': '#0891b2',
      'fill-opacity': 0.08,
    },
  };

  const boundaryLineLayer: any = {
    id: 'authority-boundary-line',
    type: 'line',
    paint: {
      'line-color': '#0891b2',
      'line-width': 2.5,
      'line-dasharray': [3, 2],
      'line-opacity': 0.6,
    },
  };

  return (
    <div className="relative">
      <div className={`h-64 w-full rounded-xl overflow-hidden border-2 relative transition-colors ${
        outOfBounds ? 'border-red-400 shadow-red-100 shadow-lg' : 'border-gray-300'
      }`}>
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: value?.lng || 34.7818,
            latitude: value?.lat || 32.0853,
            zoom: 12,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          onClick={handleMapClick}
          onLoad={handleLoad}
          cursor="crosshair"
        >
          {/* Boundary overlay */}
          {boundaryGeoJSON && (
            <Source id="authority-boundary" type="geojson" data={boundaryGeoJSON}>
              <Layer {...boundaryFillLayer} />
              <Layer {...boundaryLineLayer} />
            </Source>
          )}

          <Marker
            longitude={value?.lng || 34.7818}
            latitude={value?.lat || 32.0853}
            anchor="bottom"
          >
            <div className={`drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] ${
              outOfBounds ? 'text-red-500' : 'text-cyan-500'
            }`}>
              <MapPin size={40} fill="currentColor" />
            </div>
          </Marker>
        </Map>

        {!MAPBOX_TOKEN && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 text-center z-50">
            חסר טוקן Mapbox בקובץ .env.local
          </div>
        )}
      </div>

      {/* Out-of-bounds warning toast */}
      {showWarning && (
        <div
          className="absolute bottom-3 left-3 right-3 z-30 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3 shadow-lg animate-in slide-in-from-bottom-3"
          dir="rtl"
        >
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">
              שימו לב: המיקום שבחרתם נמצא מחוץ לשטח השיפוט של הרשות
            </p>
            {enforceStrict && (
              <p className="text-xs text-red-600 mt-0.5">
                לא ניתן לשמור מיקום מחוץ לגבולות הרשות
              </p>
            )}
          </div>
        </div>
      )}

      {/* Persistent out-of-bounds indicator */}
      {outOfBounds && !showWarning && (
        <div className="mt-2 flex items-center gap-2 text-red-600 text-xs font-bold" dir="rtl">
          <AlertTriangle size={14} />
          <span>המיקום הנוכחי נמצא מחוץ לגבולות הרשות</span>
        </div>
      )}
    </div>
  );
}
