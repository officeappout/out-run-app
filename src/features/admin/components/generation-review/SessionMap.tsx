'use client';
/**
 * Small Mapbox preview of one flagged session: the stored (privacy-trimmed) route line, station
 * parks (red when the route misses them by > 30 m, green otherwise). Light style.
 */
import { useMemo } from 'react';
import dynamicImport from 'next/dynamic';
import 'mapbox-gl/dist/mapbox-gl.css';
import { decodePolyline } from '@/lib/generation-review/polyline';
import { STATION_MAX_DISTANCE_M } from '@/lib/generation-review/invariants/route-misses-station-park';
import type { GenerationOutput } from '@/lib/generation-review/types';

const Map = dynamicImport(() => import('react-map-gl').then((m) => m.default), { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse" /> });
const Source = dynamicImport(() => import('react-map-gl').then((m) => m.Source), { ssr: false });
const Layer = dynamicImport(() => import('react-map-gl').then((m) => m.Layer), { ssr: false });
const Marker = dynamicImport(() => import('react-map-gl').then((m) => m.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function SessionMap({ output }: { output: GenerationOutput }) {
  const line = useMemo(() => (output.route?.polyline ? decodePolyline(output.route.polyline) : []), [output.route?.polyline]);
  const points = [...line, ...output.stations.map((s) => [s.lng, s.lat] as [number, number])];
  if (points.length === 0) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } };
  return (
    <div className="h-56 w-full overflow-hidden rounded-lg border border-slate-200">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 30 } }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
      >
        {line.length > 1 && (
          <Source id="gr-line" type="geojson" data={data}>
            <Layer id="gr-line-l" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': '#0ea5e9', 'line-width': 4 }} />
          </Source>
        )}
        {output.stations.map((s) => {
          const miss = typeof s.distanceToRouteM === 'number' && s.distanceToRouteM > STATION_MAX_DISTANCE_M;
          return (
            <Marker key={s.parkId} longitude={s.lng} latitude={s.lat} anchor="center">
              <div
                className={`w-4 h-4 rounded-full border-2 border-white shadow ${miss ? 'bg-red-500' : 'bg-emerald-500'}`}
                title={`${s.parkId}${typeof s.distanceToRouteM === 'number' ? ` · ${s.distanceToRouteM} מ׳ מהמסלול` : ''}`}
              />
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
