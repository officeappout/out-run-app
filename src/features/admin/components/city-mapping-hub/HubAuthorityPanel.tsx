'use client';

/**
 * HubAuthorityPanel — the selected authority's drawer under the map (§2.1):
 * פערים (summary + gaps) | תרומות (pending user contributions) | מיקומים
 * (parks the team entered, with photos / equipment) | שכבות (the existing
 * MapHealthCard, reused as is). Tab in the URL (?panel=).
 */
import type { ReactNode } from 'react';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import type { HubPanelTab } from '@/lib/city-mapping-hub/url-state';
import MapHealthCard from '../city-inventory/MapHealthCard';
import HubAuthoritySummary from './HubAuthoritySummary';
import HubPointList, { type HubPointItem } from './HubPointList';
import type { HubLayersState } from './useHubLayers';

export interface HubAuthorityPanelProps {
  row: HubRow | null;
  tab: HubPanelTab;
  onTab: (t: HubPanelTab) => void;
  onClear: () => void;
  layerState: HubLayersState;
  selectedFeatureId: string | null;
  onFocus: (item: HubPointItem) => void;
  actions?: (item: HubPointItem) => ReactNode;
}

export default function HubAuthorityPanel({ row, tab, onTab, onClear, layerState, selectedFeatureId, onFocus, actions }: HubAuthorityPanelProps) {
  const contributions = layerState.data.contributions;
  const parks = layerState.data.parks;
  const tabs: Array<{ t: HubPanelTab; label: string }> = [
    { t: 'gaps', label: 'פערים' },
    { t: 'contributions', label: `תרומות${contributions ? ` (${contributions.total})` : ''}` },
    { t: 'parks', label: `מיקומים${parks ? ` (${parks.total})` : ''}` },
    { t: 'layers', label: 'שכבות' },
  ];
  if (!row) return <HubAuthoritySummary row={null} onClear={onClear} />;
  return (
    <div className="flex min-h-0 flex-col">
      <div role="tablist" aria-label="פאנל רשות" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 pt-2">
        {tabs.map((x) => (
          <button key={x.t} type="button" role="tab" aria-selected={tab === x.t} onClick={() => onTab(x.t)}
            className={`shrink-0 rounded-t-lg px-3 py-1.5 text-[13px] font-bold ${tab === x.t ? 'bg-cyan-50 text-cyan-800' : 'text-slate-500 hover:text-slate-800'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 overflow-auto">
        {tab === 'gaps' && <HubAuthoritySummary row={row} onClear={onClear} />}
        {tab === 'contributions' && (
          <HubPointList kind="contributions" payload={contributions} loading={layerState.loading.includes('contributions')} error={layerState.errors.contributions}
            selectedId={selectedFeatureId} onFocus={onFocus} actions={actions} />
        )}
        {tab === 'parks' && (
          <HubPointList kind="parks" payload={parks} loading={layerState.loading.includes('parks')} error={layerState.errors.parks}
            selectedId={selectedFeatureId} onFocus={onFocus} actions={actions} />
        )}
        {tab === 'layers' && <div className="p-3"><MapHealthCard authorityId={row.authorityId} cityLabel={row.name} /></div>}
      </div>
    </div>
  );
}
