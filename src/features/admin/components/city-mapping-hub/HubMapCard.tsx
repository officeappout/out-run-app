'use client';

/**
 * HubMapCard — layer chips + the map + its honest banners (loading,
 * truncated, read errors, "no geometry") for the hub (§3.1 / §3.3 / §5).
 * The layer state (useHubLayers) is owned by the shell, so the authority
 * panel's lists read the very same loaded data.
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import { POINT_FETCH_LAYERS, type HubChipLayer, type HubFetchLayer } from '@/lib/city-mapping-hub/layers';
import HubLayerChips from './HubLayerChips';
import HubMap, { type HubMapProps } from './HubMap';
import type { HubLayerData, HubLayersState } from './useHubLayers';

export interface HubMapCardProps {
  rows: HubRow[];
  visibleIds: ReadonlySet<string>;
  selected: HubRow | null;
  layers: HubChipLayer[];
  onToggleLayer: (key: HubChipLayer) => void;
  onSelectAuthority: (id: string) => void;
  layerState: HubLayersState;
  onFeatureClick?: HubMapProps['onFeatureClick'];
  selectedFeatureId?: string | null;
  focusPoint?: [number, number] | null;
  /** Rendered over the map (H3: the approve / reject popover). */
  overlay?: (data: HubLayerData) => ReactNode;
  /** In-flow row under the map (H3: bulk approve for this authority). */
  footer?: ReactNode;
}

export const LAYER_NAMES: Record<HubFetchLayer, string> = {
  boundary: 'גבול', routes: 'מסלולים', parks: 'פארקים', fitness: 'מתקני כושר', courts: 'מגרשים',
  benches: 'ספסלים', water: 'ברזיות', crossings: 'מעברי חצייה', contributions: 'תרומות',
};

function chipCounts(data: HubLayerData): Partial<Record<HubChipLayer, number>> {
  const out: Partial<Record<HubChipLayer, number>> = {};
  const routes = data.routes?.featureCollection.features;
  if (routes) {
    out.routes_approved = routes.filter((f) => f.properties?.status === 'approved').length;
    out.routes_pending = routes.filter((f) => f.properties?.status === 'pending').length;
  }
  for (const l of POINT_FETCH_LAYERS) {
    const p = data[l];
    if (p) out[l] = p.total;
  }
  return out;
}

export default function HubMapCard(p: HubMapCardProps) {
  const { data, loading, errors } = p.layerState;
  const truncated = (Object.keys(data) as HubFetchLayer[]).filter((l) => data[l]?.truncated);
  const errorList = (Object.keys(errors) as HubFetchLayer[]).filter((l) => errors[l]);
  const noBoundary = p.selected && data.boundary && data.boundary.featureCollection.features.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <HubLayerChips enabled={p.layers} counts={p.selected ? chipCounts(data) : {}} onToggle={p.onToggleLayer} />
      <div className="relative min-h-0 flex-1">
        <HubMap
          rows={p.rows}
          visibleIds={p.visibleIds}
          selected={p.selected}
          layers={p.layers}
          data={data}
          onSelectAuthority={p.onSelectAuthority}
          onFeatureClick={p.onFeatureClick}
          selectedFeatureId={p.selectedFeatureId}
          focusPoint={p.focusPoint}
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-1.5" dir="rtl">
          {p.selected && (
            <span className="rounded-lg bg-white/95 px-2.5 py-1 text-[12px] font-extrabold text-slate-700 shadow" data-testid="hub-map-crumb">
              כל הארץ › {p.selected.name}
            </span>
          )}
          {loading.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 text-[12px] font-bold text-slate-600 shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען {loading.map((l) => LAYER_NAMES[l]).join(', ')}…
            </span>
          )}
          {truncated.map((l) => (
            <span key={l} role="status" className="rounded-lg bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-800 shadow">
              {LAYER_NAMES[l]}: מוצגים {data[l]!.featureCollection.features.length} מתוך {data[l]!.total} — חתוך
            </span>
          ))}
          {errorList.map((l) => (
            <span key={l} role="alert" className="rounded-lg bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-700 shadow">
              {LAYER_NAMES[l]}: {errors[l]}
            </span>
          ))}
          {noBoundary && (
            <span className="rounded-lg bg-white/95 px-2.5 py-1 text-[12px] font-bold text-slate-500 shadow">אין גבול שמור לרשות — ממוקד לפי מסלולים / מרכז</span>
          )}
        </div>
        {p.overlay?.(data)}
      </div>
      {p.footer}
    </div>
  );
}
