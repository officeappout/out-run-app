'use client';

/**
 * HubBulkBar — bulk approve for the FOCUSED authority only (never national):
 * pending routes, and pending amenities of each enabled amenity layer. Each
 * button names the exact count; the confirm repeats it (HubBulkConfirm).
 */
import type { HubChipLayer, HubFetchLayer } from '@/lib/city-mapping-hub/layers';
import type { HubLayerData } from './useHubLayers';
import { AMENITY_LAYERS, pendingIds } from './hub-moderation.logic';
import { LAYER_NAMES } from './HubMapCard';

export interface HubBulkTarget {
  layer: HubFetchLayer;
  ids: string[];
  label: string;
  truncatedTotal: number | null;
}

export function bulkTargets(data: HubLayerData, chips: HubChipLayer[]): HubBulkTarget[] {
  const out: HubBulkTarget[] = [];
  const add = (layer: HubFetchLayer, label: string) => {
    const ids = pendingIds(data, layer);
    const p = data[layer];
    if (ids.length) out.push({ layer, ids, label, truncatedTotal: p?.truncated ? p.total : null });
  };
  if (chips.includes('routes_pending')) add('routes', 'מסלולים ממתינים');
  for (const l of AMENITY_LAYERS) if (chips.includes(l)) add(l, `${LAYER_NAMES[l]} ממתינים`);
  return out;
}

export default function HubBulkBar({ targets, disabled, onBulk }: { targets: HubBulkTarget[]; disabled: boolean; onBulk: (t: HubBulkTarget) => void }) {
  if (!targets.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2" aria-label="אישור מרובה ברשות">
      <span className="text-[11px] font-extrabold text-slate-400">אישור מרובה ברשות הזו</span>
      {targets.map((t) => (
        <button key={t.layer} type="button" disabled={disabled} onClick={() => onBulk(t)} data-testid={`hub-bulk-${t.layer}`}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
          אשר {t.ids.length} {t.label}
        </button>
      ))}
    </div>
  );
}
