'use client';

import Map, { Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

/**
 * BoundaryConfirmMap — Phase 1 Stage C2 (Add City). Shows a chosen OSM
 * administrative boundary so the operator can visually confirm it's the
 * right city before saving.
 *
 * Deliberately a NEW, separate component from LocationPicker.tsx, not a
 * reuse of it — LocationPicker is a full point-picker (click-to-set a
 * lat/lng, validate against a boundary) which this screen doesn't need;
 * this component only ever displays a boundary, never edits a point. More
 * importantly, LocationPicker's `boundaryGeoJSON` prop (and everything
 * downstream of it — isPointInPolygon, Authority.boundaryGeoJSON) is typed
 * `GeoJSON.Feature<GeoJSON.Polygon>` ONLY, which park/authority editing
 * already depends on. Real OSM city admin boundaries are frequently
 * MultiPolygon (islands, exclaves) — extract-osm-amenities-tlv.ts's own
 * fetchCityBoundary already returns `Polygon | MultiPolygon` for exactly
 * this reason. Rather than widen the shared Polygon-only chain (risking a
 * regression in already-shipped park/authority flows), this component is
 * its own small, correctly-typed surface from birth.
 *
 * Same visual pattern as LocationPicker/ApprovalPreviewMap (Source + fill
 * + dashed outline Layer, NEXT_PUBLIC_MAPBOX_TOKEN + no-token fallback,
 * react-map-gl) — reused for visual consistency, not reinvented.
 */

interface BoundaryConfirmMapProps {
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  center: { lat: number; lng: number };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const boundaryFillLayer: FillLayer = {
  id: 'city-boundary-fill',
  type: 'fill',
  paint: {
    'fill-color': '#0891b2',
    'fill-opacity': 0.12,
  },
};

const boundaryLineLayer: LineLayer = {
  id: 'city-boundary-line',
  type: 'line',
  paint: {
    'line-color': '#0891b2',
    'line-width': 2.5,
    'line-dasharray': [3, 2],
    'line-opacity': 0.8,
  },
};

export default function BoundaryConfirmMap({ geojson, center }: BoundaryConfirmMapProps) {
  return (
    <div className="relative h-72 w-full rounded-xl overflow-hidden border-2 border-gray-300">
      <Map
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 10 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <Source id="city-boundary" type="geojson" data={geojson}>
          <Layer {...boundaryFillLayer} />
          <Layer {...boundaryLineLayer} />
        </Source>
      </Map>

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 text-center z-50">
          חסר טוקן Mapbox בקובץ .env.local
        </div>
      )}
    </div>
  );
}
