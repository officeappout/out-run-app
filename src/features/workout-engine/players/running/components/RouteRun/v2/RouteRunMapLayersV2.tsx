'use client';

/**
 * RouteRunMapLayersV2 — live-map extras for a guided route run (home v2,
 * enable_home_v2; board R3-prop-route-live / -off). Rendered INSIDE AppMap's
 * <Map> during an active workout with a planned route:
 *   • km badges along the session's path (lib/route-km-markers),
 *   • the walked part of the line in the board's solid grey (restyles
 *     AppMap's existing `route-passed-line`; restored on unmount),
 *   • the "נווט חזרה" walking line (dashed) while off-route.
 * Renders nothing for users without the flag.
 */

import React, { useEffect, useMemo } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import type { LngLat } from '@/features/parks/core/services/route-progress';
import { ROUTE_PASSED_LINE } from '@/features/parks/core/components/mapLayersConfig';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useRouteRunV2Store } from '../../../store/useRouteRunV2Store';
import { buildKmMarkers, kmMarkersFeatureCollection } from '../../../lib/route-km-markers';

const CARDIO = '#65a30d';
const PASSED_V2 = { 'line-color': '#b8c4cc', 'line-opacity': 0.95 } as const;
const PASSED_LAYER_ID = 'route-passed-line';

export interface RouteRunMapLayersV2Props {
  /** The planned route path AppMap draws (fallback when the session has none). */
  routePath: LngLat[] | null;
}

export default function RouteRunMapLayersV2({ routePath }: RouteRunMapLayersV2Props) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  if (!v2 || !routePath || routePath.length < 2) return null;
  return <Layers routePath={routePath} />;
}

function Layers({ routePath }: { routePath: LngLat[] }) {
  const sessionPath = useRunningPlayer((s) => s.activeRoutePath);
  const navBackPath = useRouteRunV2Store((s) => s.navBackPath);
  const guidanceDropped = useRouteRunV2Store((s) => s.guidanceDropped);
  const { current: mapRef } = useMap();

  // Km badges count from where THIS session starts (a loop is rotated to the user).
  const path = Array.isArray(sessionPath) && sessionPath.length >= 2 ? (sessionPath as LngLat[]) : routePath;
  const kmFC = useMemo(() => kmMarkersFeatureCollection(buildKmMarkers(path)), [path]);
  const navBackFC = useMemo<GeoJSON.FeatureCollection | null>(
    () => (navBackPath && navBackPath.length >= 2
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: navBackPath } }] }
      : null),
    [navBackPath],
  );

  // Solid grey for the walked slice. AppMap mounts the layer with the same
  // workout gate, possibly a frame after us → apply on styledata too.
  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return;
    const apply = () => {
      try {
        if (!map.getLayer(PASSED_LAYER_ID)) return;
        map.setPaintProperty(PASSED_LAYER_ID, 'line-color', PASSED_V2['line-color']);
        map.setPaintProperty(PASSED_LAYER_ID, 'line-opacity', PASSED_V2['line-opacity']);
      } catch { /* style mid-reload — next styledata retries */ }
    };
    apply();
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
      try {
        if (map.getLayer(PASSED_LAYER_ID)) {
          map.setPaintProperty(PASSED_LAYER_ID, 'line-color', ROUTE_PASSED_LINE.paint['line-color']);
          map.setPaintProperty(PASSED_LAYER_ID, 'line-opacity', ROUTE_PASSED_LINE.paint['line-opacity']);
        }
      } catch { /* map already torn down */ }
    };
  }, [mapRef]);

  return (
    <>
      {navBackFC && !guidanceDropped && (
        <Source id="route-run-v2-nav-back" type="geojson" data={navBackFC}>
          <Layer
            id="route-run-v2-nav-back-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#f59e0b', 'line-width': 4, 'line-dasharray': [1.2, 1.6] }}
          />
        </Source>
      )}
      {kmFC.features.length > 0 && (
        <Source id="route-run-v2-km" type="geojson" data={kmFC}>
          <Layer
            id="route-run-v2-km-dot"
            type="circle"
            minzoom={12.5}
            paint={{
              'circle-radius': 11,
              'circle-color': '#ffffff',
              'circle-stroke-color': CARDIO,
              'circle-stroke-width': 2.5,
            }}
          />
          <Layer
            id="route-run-v2-km-label"
            type="symbol"
            minzoom={12.5}
            layout={{
              'text-field': ['get', 'label'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 11,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': CARDIO }}
          />
        </Source>
      )}
    </>
  );
}
