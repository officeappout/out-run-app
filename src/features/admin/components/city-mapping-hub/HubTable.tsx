'use client';

/**
 * HubTable — every authority, one row (CITY-MAPPING-HUB-DESIGN.md §3.2).
 * ≥ md: a sortable table that scrolls inside its card (header sticky, no
 * z-index needed: no body cell is positioned). < md: cards. Selecting a row
 * focuses the authority (map + panel). Read-only: nothing here writes.
 */
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import type { HubSortKey, SortDir } from '@/lib/city-mapping-hub/filters';
import { GAP_LABELS, LEVEL_DOT, NOT_MEASURED, TYPE_LABELS, dateText, densityText, pctText, quotaPct } from './hub-display';

export interface HubTableProps {
  rows: HubRow[];
  selectedId: string | null;
  sort: HubSortKey;
  dir: SortDir;
  onSort: (key: HubSortKey) => void;
  onSelect: (id: string) => void;
}

const COLUMNS: Array<{ key: HubSortKey; label: string }> = [
  { key: 'name', label: 'רשות' },
  { key: 'score', label: 'מוכנות' },
  { key: 'approvedRoutes', label: 'מסלולים / מכסה' },
  { key: 'pendingRoutes', label: 'ממתינים' },
  { key: 'pendingContributions', label: 'תרומות' },
  { key: 'shadeCoveragePct', label: 'צל' },
  { key: 'lightingCoveragePct', label: 'תאורה' },
  { key: 'benchesDensity', label: 'ספסלים/ק״מ' },
  { key: 'waterDensity', label: 'ברזיות/ק״מ' },
  { key: 'toiletsDensity', label: 'שירותים/ק״מ' },
  { key: 'gaps', label: 'פערים מובילים' },
  { key: 'lastRefreshAt', label: 'רענון' },
];

const nm = <span className="text-xs font-semibold text-slate-400">{NOT_MEASURED}</span>;
const cell = (text: string) => (text === NOT_MEASURED ? nm : text);

function Level({ r }: { r: HubRow }) {
  if (!r.level) return nm;
  return (
    <span className="inline-flex items-center gap-1.5 font-extrabold">
      <i className={`inline-block h-2.5 w-2.5 rounded-full ${LEVEL_DOT[r.level]}`} aria-hidden />
      {r.score ?? '—'}
    </span>
  );
}

function Quota({ r }: { r: HubRow }) {
  const p = quotaPct(r);
  const tone = p < 50 ? 'bg-red-500' : p < 100 ? 'bg-amber-500' : 'bg-cyan-500';
  return (
    <div className="flex min-w-[110px] items-center gap-2" title={`מכסה ${r.quota.min}–${r.quota.max}`}>
      <b className="tabular-nums">{r.approvedRoutes}/{r.quota.min}</b>
      <div className="h-1.5 min-w-[50px] flex-1 overflow-hidden rounded-full bg-slate-100">
        <i className={`block h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function Gaps({ r }: { r: HubRow }) {
  if (!r.gaps.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {r.gaps.slice(0, 2).map((g, i) => (
        <span key={g} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${i === 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{GAP_LABELS[g]}</span>
      ))}
      {r.gaps.length > 2 && <span className="text-xs font-semibold text-slate-400">+{r.gaps.length - 2}</span>}
    </span>
  );
}

const pendingText = (n: number) => (n > 0 ? <span className="font-extrabold text-orange-600">{n}</span> : <span className="text-slate-400">0</span>);

export default function HubTable({ rows, selectedId, sort, dir, onSort, onSelect }: HubTableProps) {
  const selectedRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    // Selection from elsewhere (the map) scrolls the row into view.
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  if (!rows.length) {
    return <div className="px-4 py-10 text-center text-sm font-semibold text-slate-400">אין רשויות שתואמות את הסינון</div>;
  }
  return (
    <>
      <div className="hidden min-h-0 flex-1 overflow-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const on = sort === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="sticky top-0 whitespace-nowrap border-b border-slate-200 bg-white px-2.5 py-2 text-start text-[11.5px] font-extrabold text-slate-600">
                    <button type="button" onClick={() => onSort(c.key)} className={`inline-flex items-center gap-1 ${on ? 'text-cyan-800' : ''}`}>
                      {c.label}
                      {on ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sel = r.authorityId === selectedId;
              return (
                <tr
                  key={r.authorityId}
                  ref={sel ? selectedRef : undefined}
                  data-testid="hub-row"
                  data-id={r.authorityId}
                  tabIndex={0}
                  aria-selected={sel}
                  onClick={() => onSelect(r.authorityId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.authorityId); } }}
                  className={`cursor-pointer tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 ${sel ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                >
                  <td className={`whitespace-nowrap border-b border-slate-100 px-2.5 py-2 font-extrabold ${sel ? 'shadow-[inset_-3px_0_0_#06b6d4]' : ''}`}>
                    {r.name}
                    <span className="block text-[11px] font-semibold text-slate-400">{TYPE_LABELS[r.authorityType] ?? r.authorityType}{r.isActiveClient ? ' · משלם' : ''}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2"><Level r={r} /></td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2"><Quota r={r} /></td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{pendingText(r.pendingRoutes)}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{pendingText(r.pendingContributions + r.pendingParks)}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{cell(pctText(r.shadeCoveragePct))}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{cell(pctText(r.lightingCoveragePct))}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{cell(densityText(r.benchesDensity))}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{cell(densityText(r.waterDensity))}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2">{cell(densityText(r.toiletsDensity))}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2"><Gaps r={r} /></td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 text-xs text-slate-400">{dateText(r.lastRefreshAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 p-2 md:hidden" aria-label="רשויות">
        {rows.map((r) => {
          const sel = r.authorityId === selectedId;
          return (
            <li key={r.authorityId}>
              <button
                type="button"
                data-testid="hub-card"
                aria-pressed={sel}
                onClick={() => onSelect(r.authorityId)}
                className={`w-full rounded-xl border p-3 text-start ${sel ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 break-words text-sm font-extrabold">
                    {r.name} <span className="text-[11px] font-semibold text-slate-400">· {TYPE_LABELS[r.authorityType] ?? r.authorityType}</span>
                  </h4>
                  <Level r={r} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3"><Quota r={r} />{r.pendingRoutes > 0 && <span className="text-xs font-extrabold text-orange-600">{r.pendingRoutes} ממתינים</span>}</div>
                <div className="mt-2"><Gaps r={r} /></div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
