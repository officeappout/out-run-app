'use client';
/**
 * Map for /admin/routes/quality: click to set the start, generated routes
 * colour-coded (blue = current generator, green = v1, amber = v1 + our routes,
 * violet / pink = GraphHopper / + our routes; faded when they fail the v1
 * bars), red markers on U-turns / spurs, orange markers on unmarked crossings
 * of tertiary+ roads, and (toggle) our mapped routes near the start as a wide
 * teal band. Selecting a row in the table highlights it.
 */
import { useEffect, useMemo, useRef } from 'react';
import dynamicImport from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { QualityRunRoute } from './types';
import type { OurRouteLine } from '@/lib/route-quality';

const Map = dynamicImport(() => import('react-map-gl').then(m => m.default), { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" /> });
const Source = dynamicImport(() => import('react-map-gl').then(m => m.Source), { ssr: false });
const Layer = dynamicImport(() => import('react-map-gl').then(m => m.Layer), { ssr: false });
const Marker = dynamicImport(() => import('react-map-gl').then(m => m.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
export const VARIANT_COLOR = { off: '#3B82F6', on: '#10B981', ours: '#F59E0B', gh: '#8B5CF6', ghours: '#EC4899' } as const;
/** Overlay colour for our mapped routes (wide, translucent, under the generated loops). */
export const OUR_ROUTES_COLOR = '#0F766E';

interface Props {
  start: { lat: number; lng: number };
  routes: QualityRunRoute[];
  selectedKey: string | null;
  onPickStart: (p: { lat: number; lng: number }) => void;
  /** Our mapped routes near the start (overlay). */
  ourRoutes?: OurRouteLine[];
  showOurRoutes?: boolean;
}

export default function RouteQualityMap({ start, routes, selectedKey, onPickStart, ourRoutes = [], showOurRoutes = false }: Props) {
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    mapRef.current?.flyTo({ center: [start.lng, start.lat], zoom: 13.5, duration: 600 });
  }, [start.lat, start.lng]);

  const lines = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: routes.map(r => ({
      type: 'Feature' as const,
      properties: { key: r.key, color: VARIANT_COLOR[r.variant], pass: r.verdict.pass ? 1 : 0, selected: r.key === selectedKey ? 1 : 0 },
      geometry: { type: 'LineString' as const, coordinates: r.path },
    })),
  }), [routes, selectedKey]);

  const ourLines = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: ourRoutes.map(r => ({
      type: 'Feature' as const,
      properties: { id: r.id, name: r.name ?? '' },
      geometry: { type: 'LineString' as const, coordinates: r.path },
    })),
  }), [ourRoutes]);

  const visible = selectedKey ? routes.filter(r => r.key === selectedKey) : routes;
  const uturns = visible.flatMap(r => r.metrics.uTurns.map((u, i) => ({ key: `${r.key}-u${i}`, coord: u.coord, label: u.kind === 'spur' ? `ענף מת ${Math.round(u.depthM)} מ׳` : 'פרסה' })));
  const crossings = visible.flatMap(r => (r.metrics.crossings?.marks ?? []).filter(c => c.control === 'unmarked').map((c, i) => ({ key: `${r.key}-c${i}`, coord: c.coord, label: c.roadName ?? c.highway })));

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{ longitude: start.lng, latitude: start.lat, zoom: 13.5 }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: '100%', height: '100%' }}
      onClick={e => onPickStart({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      cursor="crosshair"
    >
      {showOurRoutes && ourRoutes.length > 0 && (
        <Source id="rq-our-routes" type="geojson" data={ourLines}>
          <Layer
            id="rq-our-routes-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': OUR_ROUTES_COLOR, 'line-width': 10, 'line-opacity': 0.25 }}
          />
        </Source>
      )}
      <Source id="rq-routes" type="geojson" data={lines}>
        <Layer
          id="rq-routes-line"
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'selected'], 1], 6, 3],
            'line-opacity': selectedKey
              ? ['case', ['==', ['get', 'selected'], 1], 1, 0.08]
              : ['case', ['==', ['get', 'pass'], 1], 0.85, 0.35],
          }}
        />
      </Source>
      <Marker longitude={start.lng} latitude={start.lat} anchor="center">
        <div className="w-4 h-4 rounded-full bg-gray-900 border-2 border-white shadow" title="נקודת התחלה" />
      </Marker>
      {uturns.map(m => (
        <Marker key={m.key} longitude={m.coord[0]} latitude={m.coord[1]} anchor="center">
          <div className="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow" title={m.label} />
        </Marker>
      ))}
      {crossings.map(m => (
        <Marker key={m.key} longitude={m.coord[0]} latitude={m.coord[1]} anchor="center">
          <div className="w-3.5 h-3.5 rotate-45 bg-orange-500 border-2 border-white shadow" title={`חציה לא מסומנת — ${m.label}`} />
        </Marker>
      ))}
    </Map>
  );
}
