'use client';

/**
 * AmenitiesQueueMap — inline map view for the Approval Center's amenities
 * tab (Phase 3, POI-moderation build, 18.08.2026). Unlike ApprovalPreviewMap
 * (one entity's geometry inside the detail drawer), this renders the whole
 * filtered queue as markers so a reviewer can spot-check "does this cluster
 * of benches actually look like a park" before bulk-approving.
 *
 * Mirrors ApprovalPreviewMap's scaffold exactly (react-map-gl, streets-v12,
 * Hebrew labels) — no new map primitive. Read-only navigation only: clicking
 * a marker opens the existing ApprovalDetailModal via onSelect; there is no
 * map-based multi-select (bulk-select stays list-only — no precedent for
 * map-based multi-select exists anywhere in this codebase).
 *
 * No clustering library exists in this codebase (checked: no supercluster,
 * no Mapbox `cluster: true` source). Rather than introduce one, this caps
 * rendered markers at MAX_MARKERS and shows a banner — the honest, low-risk
 * choice matching the only prior precedent (admin/routes lab tab's amenities
 * layer, also uncapped-but-city-scoped-to-500).
 */
import { useCallback, useMemo } from 'react';
import dynamicImport from 'next/dynamic';
import 'mapbox-gl/dist/mapbox-gl.css';
import { amenityEmoji } from '@/features/admin/services/osm-amenity-admin.service';
import type { AmenityCategory, CourtSport } from '@/features/parks/core/types/osm-amenity.types';

const MapComponent = dynamicImport(
  () => import('react-map-gl').then(mod => mod.default),
  { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" /> },
);
const Marker = dynamicImport(() => import('react-map-gl').then(mod => mod.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const MAX_MARKERS = 400;
const TLV = { longitude: 34.7818, latitude: 32.0853, zoom: 12 };

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

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function padBounds(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  const dLng = Math.max(maxLng - minLng, 0.003) * 0.5;
  const dLat = Math.max(maxLat - minLat, 0.003) * 0.5;
  return [
    [minLng - dLng, minLat - dLat],
    [maxLng + dLng, maxLat + dLat],
  ] as [[number, number], [number, number]];
}

export interface AmenitiesQueueMapItem {
  id: string;
  category: AmenityCategory;
  sport?: CourtSport;
  location: { lat: number; lng: number };
  name?: string | null;
}

interface AmenitiesQueueMapProps {
  items: AmenitiesQueueMapItem[];
  onSelect: (id: string) => void;
}

export default function AmenitiesQueueMap({ items, onSelect }: AmenitiesQueueMapProps) {
  const valid = useMemo(
    () => items.filter(i => isFiniteNum(i.location?.lat) && isFiniteNum(i.location?.lng)),
    [items],
  );
  const shown = valid.slice(0, MAX_MARKERS);

  const initial = shown.length > 0
    ? { longitude: shown[0].location.lng, latitude: shown[0].location.lat, zoom: 13 }
    : TLV;

  const handleLoad = useCallback(
    (e: any) => {
      const map = e?.target;
      if (!map) return;
      applyHebrewLabels(map);
      map.on?.('style.load', () => applyHebrewLabels(map));
      if (shown.length < 2) return;
      try {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const item of shown) {
          const { lng, lat } = item.location;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        }
        map.fitBounds(padBounds(minLng, minLat, maxLng, maxLat), { padding: 48, duration: 0 });
      } catch { /* fitBounds best-effort */ }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.map(i => i.id).join(',')],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-900 text-white text-center p-4 text-sm">
        חסר טוקן Mapbox בקובץ .env.local
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapComponent
        key={shown.map(i => i.id).join(',')}
        initialViewState={initial}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={handleLoad}
        cursor="grab"
      >
        {shown.map(item => (
          <Marker
            key={item.id}
            longitude={item.location.lng}
            latitude={item.location.lat}
            anchor="center"
            onClick={(e: any) => { e.originalEvent?.stopPropagation?.(); onSelect(item.id); }}
          >
            <button
              type="button"
              title={item.name || undefined}
              className="w-7 h-7 rounded-full bg-white border-2 border-teal-500 shadow-md flex items-center justify-center text-sm leading-none hover:scale-110 transition-transform cursor-pointer"
            >
              {amenityEmoji(item.category, item.sport)}
            </button>
          </Marker>
        ))}
      </MapComponent>

      {valid.length > MAX_MARKERS && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
          מוצגים {MAX_MARKERS} מתוך {valid.length} — סננו לפי קטגוריה/עיר לצפייה מלאה
        </div>
      )}
    </div>
  );
}
