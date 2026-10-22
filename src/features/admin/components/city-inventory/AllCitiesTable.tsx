'use client';

/**
 * AllCitiesTable — "כל הערים" on /admin/city-mapping (RC8 step 5). READ-ONLY.
 *
 * One row per `city_inventory` doc: readiness badge + score, approved routes
 * vs the quota, shade source + coverage, lighting coverage, last refresh.
 * Sortable by every numeric column and by name. Clicking a city opens the
 * existing per-city map-health card (the page selects that city).
 *
 * Data: GET /api/admin/city-mapping/inventory/all via
 * loadCityInventoryOverview — Admin SDK on the server, never a client
 * Firestore query. Plain in-flow card: no overlay, no z-index, no shared store.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Table2 } from 'lucide-react';
import { sortCityOverviewRows, type CityOverviewRow, type OverviewSortKey } from '@/lib/city-inventory/overview';
import { CityInventoryHealthError, loadCityInventoryOverview } from '@/features/admin/services/city-inventory-health';
import { LEVEL_LABELS, formatDate, NOT_MEASURED } from './map-health.logic';

export interface AllCitiesTableProps {
  /** Opens the per-city card for this city (the page's city picker). */
  onSelectCity: (city: string, authorityId: string) => void;
  /** Injected in tests; defaults to the API loader. */
  load?: () => Promise<CityOverviewRow[]>;
}

const LEVEL_CLASSES = {
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-amber-50 text-amber-800 border-amber-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
} as const;

const SHADE_SOURCE_LABELS: Record<string, string> = {
  technion_shade: 'טכניון',
  technion_si_daily: 'טכניון',
  canopy_estimate: 'הערכת חופה',
};

const pct = (v: number | null) => (v == null ? NOT_MEASURED : `${Math.round(v)}%`);

const COLUMNS: Array<{ key: OverviewSortKey; label: string }> = [
  { key: 'city', label: 'רשות' },
  { key: 'score', label: 'מוכנות' },
  { key: 'approvedRoutes', label: 'מסלולים מאושרים / מכסה' },
  { key: 'shadeCoveragePct', label: 'צל' },
  { key: 'lightingCoveragePct', label: 'תאורה' },
  { key: 'lastRefreshAt', label: 'רענון אחרון' },
];

export default function AllCitiesTable({ onSelectCity, load = loadCityInventoryOverview }: AllCitiesTableProps) {
  const [rows, setRows] = useState<CityOverviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<OverviewSortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await load());
    } catch (err) {
      const e = err as CityInventoryHealthError;
      setError(e?.status === 403 ? 'אין הרשאה — הטבלה זמינה ל-super admin בלבד.' : `שגיאה בטעינת הטבלה: ${e?.message ?? 'לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  const sorted = useMemo(() => (rows ? sortCityOverviewRows(rows, sortKey, sortDir) : []), [rows, sortKey, sortDir]);
  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const r of rows ?? []) c[r.level]++;
    return c;
  }, [rows]);

  function toggleSort(key: OverviewSortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'city' ? 'asc' : 'desc'); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-testid="all-cities-table">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-black text-gray-900">
          <Table2 size={16} />
          כל הערים — מצב מיפוי
          {rows && (
            <span className="text-xs font-bold text-gray-500">
              ({rows.length} · 🔴{counts.red} 🟡{counts.yellow} 🟢{counts.green})
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          רענון
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {rows && rows.length === 0 && !error && (
        <p className="text-xs text-gray-500">אין עדיין מלאי עירוני שנכתב (city_inventory ריק) — מריצים את scripts/city-inventory/run.ts --all --apply.</p>
      )}
      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-start font-black py-2 px-2 whitespace-nowrap">
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-gray-900" aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      {c.label}
                      {sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.authorityId} className="border-b border-gray-50 hover:bg-gray-50" data-testid="all-cities-row">
                  <td className="py-1.5 px-2">
                    <button type="button" onClick={() => onSelectCity(r.city, r.authorityId)} className="font-bold text-teal-700 hover:underline text-start">
                      {r.city}
                    </button>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span data-level={r.level} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${LEVEL_CLASSES[r.level]}`}>
                      {LEVEL_LABELS[r.level]} · <span dir="ltr">{r.score}</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap" dir="ltr">
                    <span className={r.approvedRoutes >= r.quota.min ? 'text-emerald-700 font-bold' : 'text-gray-700'}>{r.approvedRoutes}</span>
                    <span className="text-gray-400"> / {r.quota.min}–{r.quota.max}</span>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    {r.shadeSource ? `${SHADE_SOURCE_LABELS[r.shadeSource] ?? r.shadeSource} · ${pct(r.shadeCoveragePct)}` : <span className="text-gray-400">{NOT_MEASURED}</span>}
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">{r.lightingCoveragePct == null ? <span className="text-gray-400">{NOT_MEASURED}</span> : pct(r.lightingCoveragePct)}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-gray-500">{r.lastRefreshAt ? formatDate(new Date(r.lastRefreshAt)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
