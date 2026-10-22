'use client';

/**
 * CityMappingHub — /admin/city-mapping/hub (CITY-MAPPING-HUB-DESIGN.md §2-3),
 * behind enable_city_mapping_hub. H0: header + KPIs + filters + the all-
 * authorities table + the selected authority's summary. H1: the map
 * (national dots → selected authority's boundary + routes), layer chips in
 * the URL. H2: clustered point layers (parks, amenities, user contributions)
 * and the authority panel (gaps | contributions | parks | layers). The layer
 * state lives here so the map and the panel read the same loaded data.
 *
 * State is owned by the caller (the page keeps it in the URL — §3.1); this
 * component is controlled, so it is testable without a router. Desktop: table
 * on the right (RTL reading start), map side on the left. < md: top tabs
 * טבלה | מפה | פערים. No page-level overlay, no z-index.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import { filterHubRows, hubKpis, sortHubRows, type HubFilters, type HubSortKey } from '@/lib/city-mapping-hub/filters';
import type { HubMobileView, HubUrlState } from '@/lib/city-mapping-hub/url-state';
import { CityMappingHubError, loadHubRows } from '@/features/admin/services/city-mapping-hub.service';
import HubKpis from './HubKpis';
import HubFiltersBar from './HubFiltersBar';
import HubTable from './HubTable';
import HubAuthorityPanel from './HubAuthorityPanel';
import HubMapCard from './HubMapCard';
import type { HubPointItem } from './HubPointList';
import { useHubLayers, type LoadHubLayer } from './useHubLayers';
import { fetchLayersFor, type HubChipLayer } from '@/lib/city-mapping-hub/layers';

export interface CityMappingHubProps {
  state: HubUrlState;
  onStateChange: (next: HubUrlState) => void;
  /** Injected in tests; defaults to the guarded API loader. */
  loadRows?: () => Promise<HubRow[]>;
  /** Injected in tests; defaults to the guarded layers loader. */
  loadLayer?: LoadHubLayer;
}

const VIEWS: Array<{ v: HubMobileView; label: string }> = [
  { v: 'table', label: 'טבלה' },
  { v: 'map', label: 'מפה' },
  { v: 'gaps', label: 'פערים' },
];

/** Columns whose natural reading is "biggest first". */
const DESC_FIRST: ReadonlySet<HubSortKey> = new Set<HubSortKey>(['pendingRoutes', 'pendingContributions', 'gaps', 'lastRefreshAt']);

export default function CityMappingHub({ state, onStateChange, loadRows = loadHubRows, loadLayer }: CityMappingHubProps) {
  const [rows, setRows] = useState<HubRow[] | null>(null);
  /** Layer-cache version: bumped on refresh (and, in H3, after every write). */
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The loader is read through a ref: an inline loader must not re-trigger the initial load.
  const loadRowsRef = useRef(loadRows);
  loadRowsRef.current = loadRows;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadRowsRef.current());
    } catch (err) {
      const e = err as CityMappingHubError;
      setError(e?.status === 403 ? `אין גישה: ${e.message}` : `שגיאה בטעינת הרשויות: ${e?.message ?? 'לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  /** Manual refresh: re-read the table AND drop every cached map layer. */
  const refresh = useCallback(() => { setVersion((v) => v + 1); return load(); }, [load]);

  const patch = useCallback((p: Partial<HubUrlState>) => onStateChange({ ...state, ...p }), [state, onStateChange]);
  const visible = useMemo(() => sortHubRows(filterHubRows(rows ?? [], state), state.sort, state.dir), [rows, state]);
  const kpis = useMemo(() => hubKpis(rows ?? []), [rows]);
  const selected = useMemo(() => rows?.find((r) => r.authorityId === state.authority) ?? null, [rows, state.authority]);

  // §3.1: filtering down to exactly one authority behaves like selecting it.
  useEffect(() => {
    if (visible.length === 1 && state.authority !== visible[0].authorityId) patch({ authority: visible[0].authorityId });
  }, [visible, state.authority, patch]);

  const onSort = (key: HubSortKey) => {
    if (state.sort === key) patch({ dir: state.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' });
  };
  const onFilters = (p: Partial<HubFilters>) => patch(p);
  const onSelect = (id: string) => patch({ authority: id, view: state.view === 'table' ? 'map' : state.view });
  const visibleIds = useMemo(() => new Set(visible.map((r) => r.authorityId)), [visible]);
  const onToggleLayer = (k: HubChipLayer) =>
    patch({ layers: state.layers.includes(k) ? state.layers.filter((x) => x !== k) : [...state.layers, k] });

  const fetchLayers = useMemo(() => fetchLayersFor(state.layers), [state.layers]);
  const layerState = useHubLayers(selected?.authorityId ?? null, fetchLayers, version, loadLayer);
  /** The map / list item in focus (H3: the approve / reject popover target). */
  const [focused, setFocused] = useState<HubPointItem | null>(null);
  useEffect(() => { setFocused(null); }, [state.authority]);
  const onFocusItem = (it: HubPointItem) => setFocused(it);
  const onFeatureClick = (f: HubPointItem) => {
    setFocused(f);
    if (f.kind === 'contribution' && state.panel !== 'contributions') patch({ panel: 'contributions' });
    else if (f.kind === 'park' && state.panel !== 'parks') patch({ panel: 'parks' });
  };

  const show = (v: HubMobileView) => (state.view === v ? 'flex' : 'hidden');

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[1600px] flex-col gap-3.5 pb-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-black tracking-tight">מרכז מיפוי ערים</h1>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-extrabold text-cyan-800">enable_city_mapping_hub</span>
        <div className="flex-1" />
        <Link href="/admin/city-mapping" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold hover:bg-slate-50">
          <Plus className="h-4 w-4" /> הוספה והרצה
        </Link>
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} רענון
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <HubKpis k={kpis} />
      <HubFiltersBar filters={state} onChange={onFilters} />

      <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 md:hidden" aria-label="תצוגה">
        {VIEWS.map((v) => (
          <button key={v.v} type="button" aria-pressed={state.view === v.v} onClick={() => patch({ view: v.v })}
            className={`flex-1 rounded-lg py-1.5 text-sm font-bold ${state.view === v.v ? 'bg-cyan-50 text-cyan-800' : 'text-slate-600'}`}>
            {v.label}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
        <section className={`${show('table')} min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:flex md:h-[max(600px,calc(100vh-260px))]`} aria-label="טבלת רשויות">
          <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
            <h2 className="text-sm font-black">רשויות</h2>
            <small className="text-xs font-semibold text-slate-400" data-testid="hub-count">{rows ? `${visible.length} מוצגות מתוך ${rows.length}` : ''}</small>
          </div>
          {rows === null && loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> טוען רשויות…</div>
          ) : (
            <HubTable rows={visible} selectedId={state.authority} sort={state.sort} dir={state.dir} onSort={onSort} onSelect={onSelect} />
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3.5 md:h-[max(600px,calc(100vh-260px))]" aria-label="מפה ופערים">
          <div className={`${show('map')} h-[60vh] min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:flex md:h-auto md:min-h-[420px] md:flex-1`}>
            <HubMapCard
              rows={rows ?? []}
              visibleIds={visibleIds}
              selected={selected}
              layers={state.layers}
              onToggleLayer={onToggleLayer}
              onSelectAuthority={onSelect}
              layerState={layerState}
              onFeatureClick={onFeatureClick}
              selectedFeatureId={focused?.id ?? null}
              focusPoint={focused && focused.kind !== 'route' ? focused.lngLat : null}
            />
          </div>
          <div className={`${show('gaps')} flex-col overflow-auto rounded-2xl border border-slate-100 bg-white shadow-sm md:flex md:max-h-[300px] md:shrink-0`}>
            <HubAuthorityPanel
              row={selected}
              tab={state.panel}
              onTab={(t) => patch({ panel: t })}
              onClear={() => patch({ authority: null })}
              layerState={layerState}
              selectedFeatureId={focused?.id ?? null}
              onFocus={onFocusItem}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
