'use client';

/**
 * HubMap — the hub's map (CITY-MAPPING-HUB-DESIGN.md §3.1 / §3.3), react-map-gl
 * + mapbox-gl like every admin map (dynamic import, ssr:false, Hebrew labels;
 * pattern of RouteShapeReviewMap). No authority selected → national view: one
 * dot per authority (colour = readiness level, size = population, filtered-out
 * ones dimmed); click selects it. Authority selected → its boundary + routes
 * (approved solid cyan, pending dashed orange), fitBounds to the data.
 *
 * Legend / banners are absolutely positioned inside this relative box, after
 * the canvas in DOM order — no z-index value needed (none added).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import { bboxOf, type FC } from '@/lib/city-mapping-hub/layer-payload';
import type { HubChipLayer } from '@/lib/city-mapping-hub/layers';
import type { HubLayerData } from './useHubLayers';
import { ISRAEL_BOUNDS, LEVEL_COLORS, ROUTE_COLORS, authorityPointsFC, filterRoutesFC } from './hub-map.logic';

const Map = dynamicImport(() => import('react-map-gl').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-100" />,
});
const Source = dynamicImport(() => import('react-map-gl').then((m) => m.Source), { ssr: false });
const Layer = dynamicImport(() => import('react-map-gl').then((m) => m.Layer), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function applyHebrewLabels(map: any) {
  try {
    const style = map.getStyle?.();
    for (const layer of style?.layers ?? []) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        try { map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]); } catch { /* locked */ }
      }
    }
  } catch { /* ignore */ }
}

export interface HubMapProps {
  rows: HubRow[];
  visibleIds: ReadonlySet<string>;
  selected: HubRow | null;
  layers: HubChipLayer[];
  data: HubLayerData;
  onSelectAuthority: (id: string) => void;
  /** A clicked map feature (route …) — H3 opens the approve / reject popover. */
  onFeatureClick?: (f: { kind: string; id: string; properties: Record<string, unknown>; lngLat: [number, number] }) => void;
  selectedFeatureId?: string | null;
}

const EMPTY: FC = { type: 'FeatureCollection', features: [] };

export default function HubMap({ rows, visibleIds, selected, layers, data, onSelectAuthority, onFeatureClick, selectedFeatureId }: HubMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);

  const points = useMemo(() => authorityPointsFC(rows, visibleIds), [rows, visibleIds]);
  const statuses = useMemo(() => new Set<string>(layers.filter((l) => l.startsWith('routes_')).map((l) => l.slice('routes_'.length))), [layers]);
  const routes = useMemo(() => filterRoutesFC(data.routes?.featureCollection, statuses), [data.routes, statuses]);
  const boundary = data.boundary?.featureCollection ?? EMPTY;

  // Selection → fit to boundary (else routes, else the authority's center). None → Israel.
  const bbox = useMemo(() => (selected ? bboxOf(boundary, data.routes?.featureCollection) : null), [selected, boundary, data.routes]);
  useEffect(() => {
    const m = mapRef.current;
    if (!loaded || !m) return;
    try {
      if (!selected) m.fitBounds(ISRAEL_BOUNDS, { padding: 24, duration: 600 });
      else if (bbox) m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 48, duration: 600, maxZoom: 15 });
      else if (selected.center) m.flyTo({ center: [selected.center.lng, selected.center.lat], zoom: 12, duration: 600 });
    } catch { /* map not ready */ }
  }, [loaded, selected, bbox]);

  const interactive = selected ? ['hub-routes-approved', 'hub-routes-pending'] : ['hub-authority-dots'];
  const sel = selectedFeatureId ?? '';

  return (
    <div className="relative h-full w-full" data-testid="hub-map">
      <Map
        ref={mapRef as any}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ bounds: ISRAEL_BOUNDS }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        onLoad={(e: any) => { applyHebrewLabels(e.target); setLoaded(true); }}
        interactiveLayerIds={interactive}
        cursor="pointer"
        onClick={(e: any) => {
          const f = e.features?.[0];
          const p = (f?.properties ?? {}) as Record<string, unknown>;
          if (!f || typeof p.id !== 'string') return;
          if (!selected) { onSelectAuthority(p.id); return; }
          onFeatureClick?.({ kind: String(p.kind ?? ''), id: p.id, properties: p, lngLat: [e.lngLat.lng, e.lngLat.lat] });
        }}
      >
        {!selected && (
          <Source id="hub-authorities" type="geojson" data={points as any}>
            <Layer id="hub-authority-dots" type="circle" paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': ['get', 'radius'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.2, 0.95],
              'circle-stroke-opacity': ['case', ['==', ['get', 'dim'], 1], 0.2, 1],
            }} />
          </Source>
        )}
        {selected && (
          <Source id="hub-boundary" type="geojson" data={boundary as any}>
            <Layer id="hub-boundary-fill" type="fill" paint={{ 'fill-color': '#06b6d4', 'fill-opacity': 0.04 }} />
            <Layer id="hub-boundary-line" type="line" paint={{ 'line-color': '#0e7490', 'line-width': 2, 'line-dasharray': [2, 1.5] }} />
          </Source>
        )}
        {selected && (
          <Source id="hub-routes" type="geojson" data={routes as any}>
            <Layer id="hub-routes-approved" type="line" filter={['==', ['get', 'status'], 'approved']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ROUTE_COLORS.approved, 'line-width': ['case', ['==', ['get', 'id'], sel], 7, 4], 'line-opacity': 0.9 }} />
            <Layer id="hub-routes-pending" type="line" filter={['==', ['get', 'status'], 'pending']}
              layout={{ 'line-join': 'round' }}
              paint={{ 'line-color': ROUTE_COLORS.pending, 'line-width': ['case', ['==', ['get', 'id'], sel], 7, 4], 'line-dasharray': [1.6, 1.2] }} />
          </Source>
        )}
      </Map>

      <div className="absolute bottom-3 right-3 space-y-1 rounded-xl bg-white/95 px-3 py-2 text-[11px] font-bold text-slate-600 shadow" dir="rtl" aria-label="מקרא">
        {selected ? (
          <>
            <div className="flex items-center gap-2"><span className="inline-block h-1 w-5 rounded" style={{ background: ROUTE_COLORS.approved }} />מסלול מאושר</div>
            <div className="flex items-center gap-2"><span className="inline-block h-0 w-5 border-t-[3px] border-dashed" style={{ borderColor: ROUTE_COLORS.pending }} />מסלול ממתין</div>
          </>
        ) : (
          (['red', 'yellow', 'green', 'none'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS[k] }} />
              {{ red: 'אדום', yellow: 'צהוב', green: 'ירוק', none: 'לא נמדד' }[k]}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
