'use client';

/**
 * RouteShapeReviewMap — multi-route browse map for the shape-review screen.
 *
 * Not a third independent map implementation by accident — there were
 * already 4+ independent `react-map-gl` wrappers in this codebase before
 * this one (inline in /admin/routes' AdminRouteManager, ApprovalPreviewMap,
 * RouteEditor, the authority/routes/[id]/edit page), none importing each
 * other, each re-copying the same dynamic-import + applyHebrewLabels
 * boilerplate. None of them fit this screen's need (many routes at once,
 * click-to-select, color-coded by decision) without being repurposed past
 * recognition. This is the first one of them extracted as a real, exported,
 * reusable component rather than inline page JSX — closely follows
 * /admin/routes' established multi-route pattern (same boilerplate, same
 * click→select→fitBounds shape) so it's at least the LAST copy-paste, not
 * one more. See the approval-screen PR description for the full reasoning.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const Map = dynamicImport(() => import('react-map-gl').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" />,
});
const Source = dynamicImport(() => import('react-map-gl').then((m) => m.Source), { ssr: false });
const Layer = dynamicImport(() => import('react-map-gl').then((m) => m.Layer), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function applyHebrewLabels(map: any) {
  try {
    const style = map.getStyle?.();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        try { map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]); } catch { /* locked layer */ }
      }
    }
  } catch { /* ignore */ }
}

export type ReviewDecision = 'approved' | 'maybe' | 'rejected' | null;

export interface ReviewMapRoute {
  id: string;
  name: string;
  path: [number, number][]; // [lng, lat], already normalized
  decision: ReviewDecision;
}

const DECISION_COLOR: Record<string, string> = {
  approved: '#22C55E',
  maybe: '#EAB308',
  rejected: '#EF4444',
  undecided: '#9CA3AF',
};

interface RouteShapeReviewMapProps {
  routes: ReviewMapRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RouteShapeReviewMap({ routes, selectedId, onSelect }: RouteShapeReviewMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);

  const bounds = useMemo(() => {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const r of routes) {
      for (const [lng, lat] of r.path) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return Number.isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] as [number, number, number, number] : null;
  }, [routes]);

  useEffect(() => {
    if (!loaded || !bounds || !mapRef.current) return;
    try {
      mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 48, duration: 500 });
    } catch { /* map not ready */ }
  }, [loaded, bounds]);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: routes.map((r) => ({
      type: 'Feature' as const,
      properties: { id: r.id, name: r.name, color: DECISION_COLOR[r.decision ?? 'undecided'] },
      geometry: { type: 'LineString' as const, coordinates: r.path },
    })),
  }), [routes]);

  return (
    <div className="h-full w-full relative">
      <Map
        ref={mapRef as any}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 34.85, latitude: 32.08, zoom: 11 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onLoad={(e: any) => { applyHebrewLabels(e.target); setLoaded(true); }}
        interactiveLayerIds={['shape-review-routes-line']}
        onClick={(e: any) => {
          const f = e.features?.[0];
          if (f?.properties?.id) onSelect(f.properties.id);
        }}
        cursor="pointer"
      >
        <Source id="shape-review-routes" type="geojson" data={geojson as any}>
          <Layer
            id="shape-review-routes-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['case', ['==', ['get', 'id'], selectedId ?? ''], 6, 3],
              'line-opacity': ['case', ['==', ['get', 'id'], selectedId ?? ''], 1, 0.75],
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      </Map>
      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 text-[11px] space-y-1" dir="rtl">
        {([['undecided', 'טרם הוחלט'], ['approved', 'אושר'], ['maybe', 'אולי'], ['rejected', 'נדחה']] as const).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: DECISION_COLOR[k] }} />
            <span className="text-gray-600 font-bold">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
