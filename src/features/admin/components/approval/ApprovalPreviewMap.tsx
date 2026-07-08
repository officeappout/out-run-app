'use client';

/**
 * ApprovalPreviewMap — read-only geometry preview for the Approval Center.
 *
 * ONE map surface for every moderatable entity, so a reviewer can verify the
 * real-world location before approving:
 *   point  → parks / UGC new-location  (single marker)
 *   route  → official_routes.path      (polyline + start/end markers)
 *   climb  → climb_segments            (center marker + bbox rectangle)
 *
 * Mirrors the existing map stack exactly (react-map-gl, streets-v12, Hebrew
 * labels, the double-line paint from RouteEditor) — no new rendering primitive.
 * Read-only: no click handlers, cursor 'grab'.
 */
import { useCallback } from 'react';
import dynamicImport from 'next/dynamic';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Mountain } from 'lucide-react';

// ── Dynamic map imports (SSR-safe) — same pattern as RouteEditor ──────
const MapComponent = dynamicImport(
  () => import('react-map-gl').then(mod => mod.default),
  { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" /> },
);
const Source = dynamicImport(() => import('react-map-gl').then(mod => mod.Source), { ssr: false });
const Layer = dynamicImport(() => import('react-map-gl').then(mod => mod.Layer), { ssr: false });
const Marker = dynamicImport(() => import('react-map-gl').then(mod => mod.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Swap Mapbox symbol labels to Hebrew — copied from RouteEditor.applyHebrewLabels.
function applyHebrewLabels(map: any) {
  try {
    const style = map.getStyle?.();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]);
        } catch { /* skip locked layers */ }
      }
    }
  } catch { /* ignore */ }
}

// ── Geometry contract (one discriminated shape per entity kind) ───────
export type PreviewGeometry =
  | { kind: 'point'; lat: number; lng: number }
  | { kind: 'route'; path: [number, number][] } // [lng, lat] — matches official_routes.path
  | {
      kind: 'climb';
      center: { lat: number; lng: number };
      bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
    };

interface ApprovalPreviewMapProps {
  geometry: PreviewGeometry;
}

// NaN is typeof 'number' — coordinate guards MUST use Number.isFinite.
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const finitePair = (p: any): p is [number, number] => Array.isArray(p) && isFiniteNum(p[0]) && isFiniteNum(p[1]);

// Expand a degenerate/tiny bbox so fitBounds frames it instead of over-zooming.
// ~0.0015° ≈ 150m — enough context around a short climb segment.
function padBounds(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const dLng = Math.max(maxLng - minLng, 0.003) * 0.5;
  const dLat = Math.max(maxLat - minLat, 0.003) * 0.5;
  return [
    [minLng - dLng, minLat - dLat],
    [maxLng + dLng, maxLat + dLat],
  ] as [[number, number], [number, number]];
}

export default function ApprovalPreviewMap({ geometry }: ApprovalPreviewMapProps) {
  // Valid finite route points only — never let NaN reach the map.
  const routePath = geometry.kind === 'route' ? geometry.path.filter(finitePair) : [];

  // Initial center: the point / climb center / first route waypoint. Falls back to
  // Tel Aviv center if the incoming coords are non-finite (defensive — the modal
  // already validates, but this primitive must never crash on bad data).
  const TLV = { longitude: 34.7818, latitude: 32.0853, zoom: 12 };
  const initial =
    geometry.kind === 'point' && isFiniteNum(geometry.lng) && isFiniteNum(geometry.lat)
      ? { longitude: geometry.lng, latitude: geometry.lat, zoom: 15 }
      : geometry.kind === 'climb' && isFiniteNum(geometry.center?.lng) && isFiniteNum(geometry.center?.lat)
        ? { longitude: geometry.center.lng, latitude: geometry.center.lat, zoom: 15 }
        : routePath.length > 0
          ? { longitude: routePath[0][0], latitude: routePath[0][1], zoom: 14 }
          : TLV;

  const handleLoad = useCallback(
    (e: any) => {
      const map = e?.target;
      if (!map) return;
      applyHebrewLabels(map);
      map.on?.('style.load', () => applyHebrewLabels(map));

      // Frame line / bbox geometries so the whole thing is visible.
      try {
        if (geometry.kind === 'route' && routePath.length >= 2) {
          let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
          for (const [lng, lat] of routePath) {
            if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          }
          map.fitBounds(padBounds(minLng, minLat, maxLng, maxLat), { padding: 40, duration: 0 });
        } else if (geometry.kind === 'climb') {
          const { minLat, maxLat, minLng, maxLng } = geometry.bbox;
          if ([minLat, maxLat, minLng, maxLng].every(isFiniteNum)) {
            map.fitBounds(padBounds(minLng, minLat, maxLng, maxLat), { padding: 48, duration: 0 });
          }
        }
      } catch { /* fitBounds best-effort */ }
    },
    [geometry, routePath],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-900 text-white text-center p-4 text-sm">
        חסר טוקן Mapbox בקובץ .env.local
      </div>
    );
  }

  const routeLine =
    geometry.kind === 'route' && routePath.length >= 2
      ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: routePath } }
      : null;

  const climbValid =
    geometry.kind === 'climb'
    && isFiniteNum(geometry.center?.lat) && isFiniteNum(geometry.center?.lng)
    && [geometry.bbox?.minLat, geometry.bbox?.maxLat, geometry.bbox?.minLng, geometry.bbox?.maxLng].every(isFiniteNum);

  const climbBox =
    climbValid && geometry.kind === 'climb'
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[
              [geometry.bbox.minLng, geometry.bbox.minLat],
              [geometry.bbox.maxLng, geometry.bbox.minLat],
              [geometry.bbox.maxLng, geometry.bbox.maxLat],
              [geometry.bbox.minLng, geometry.bbox.maxLat],
              [geometry.bbox.minLng, geometry.bbox.minLat],
            ]],
          },
        }
      : null;

  return (
    <MapComponent
      initialViewState={initial}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      mapboxAccessToken={MAPBOX_TOKEN}
      onLoad={handleLoad}
      cursor="grab"
      interactiveLayerIds={[]}
    >
      {/* Route polyline — same double-line paint as RouteEditor */}
      {routeLine && (
        <Source id="preview-route" type="geojson" data={routeLine}>
          <Layer id="preview-route-outline" type="line"
            paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.4 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          <Layer id="preview-route-line" type="line"
            paint={{ 'line-color': '#0891b2', 'line-width': 5, 'line-opacity': 0.85 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </Source>
      )}

      {/* Climb bbox rectangle */}
      {climbBox && (
        <Source id="preview-climb-bbox" type="geojson" data={climbBox}>
          <Layer id="preview-climb-fill" type="fill"
            paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.1 }} />
          <Layer id="preview-climb-outline" type="line"
            paint={{ 'line-color': '#f97316', 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }} />
        </Source>
      )}

      {/* Markers — every coordinate guarded finite (NaN would throw in <Marker>). */}
      {geometry.kind === 'point' && isFiniteNum(geometry.lng) && isFiniteNum(geometry.lat) && (
        <Marker longitude={geometry.lng} latitude={geometry.lat} anchor="bottom">
          <div className="text-cyan-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]">
            <MapPin size={40} fill="currentColor" />
          </div>
        </Marker>
      )}

      {climbValid && geometry.kind === 'climb' && (
        <Marker longitude={geometry.center.lng} latitude={geometry.center.lat} anchor="bottom">
          <div className="text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.8)]">
            <Mountain size={34} />
          </div>
        </Marker>
      )}

      {geometry.kind === 'route' && routePath.length >= 2 && (
        <>
          <Marker longitude={routePath[0][0]} latitude={routePath[0][1]} anchor="center">
            <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow-lg" />
          </Marker>
          <Marker
            longitude={routePath[routePath.length - 1][0]}
            latitude={routePath[routePath.length - 1][1]}
            anchor="center"
          >
            <div className="w-7 h-7 rounded-full bg-red-500 border-2 border-white shadow-lg" />
          </Marker>
        </>
      )}
    </MapComponent>
  );
}
