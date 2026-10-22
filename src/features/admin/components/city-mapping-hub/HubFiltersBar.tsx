'use client';

/**
 * HubFiltersBar — search + level / type / gap / quota / paying filters of the
 * city-mapping hub table. Controlled; plain in-flow row (no overlay, no z-index).
 */
import { Search, X } from 'lucide-react';
import type { HubFilters, HubLevelFilter } from '@/lib/city-mapping-hub/filters';
import { HUB_GAP_KEYS } from '@/lib/city-mapping-hub/rows';
import { GAP_LABELS, LEVEL_DOT, TYPE_LABELS } from './hub-display';

export interface HubFiltersBarProps {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
}

const LEVELS: Array<{ v: HubLevelFilter; label: string }> = [
  { v: 'all', label: 'הכול' },
  { v: 'red', label: 'אדום' },
  { v: 'yellow', label: 'צהוב' },
  { v: 'green', label: 'ירוק' },
  { v: 'unmeasured', label: 'לא נמדד' },
];

const selectCls = 'rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300';

export default function HubFiltersBar({ filters, onChange }: HubFiltersBarProps) {
  return (
    <section className="flex flex-wrap items-center gap-2" aria-label="סינון רשויות">
      <label className="relative min-w-0 flex-[1_1_200px] max-w-sm">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="חיפוש רשות…"
          aria-label="חיפוש רשות"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
        />
        {filters.q && (
          <button type="button" onClick={() => onChange({ q: '' })} aria-label="נקה חיפוש" className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      <div role="group" aria-label="סינון לפי רמה" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-0.5">
        {LEVELS.map((l) => (
          <button
            key={l.v}
            type="button"
            aria-pressed={filters.level === l.v}
            onClick={() => onChange({ level: l.v })}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold ${filters.level === l.v ? 'bg-cyan-50 text-cyan-800' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {l.v !== 'all' && l.v !== 'unmeasured' && <i className={`inline-block h-2 w-2 rounded-full ${LEVEL_DOT[l.v]}`} aria-hidden />}
            {l.v === 'unmeasured' && <i className="inline-block h-2 w-2 rounded-full border border-slate-400" aria-hidden />}
            {l.label}
          </button>
        ))}
      </div>

      <select aria-label="סוג רשות" className={selectCls} value={filters.type} onChange={(e) => onChange({ type: e.target.value })}>
        <option value="all">כל הסוגים</option>
        {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <select aria-label="סינון פער" className={selectCls} value={filters.gap} onChange={(e) => onChange({ gap: e.target.value as HubFilters['gap'] })}>
        <option value="all">כל הפערים</option>
        <option value="pending">יש מסלולים ממתינים</option>
        <option value="contributions">יש תרומות / מיקומים ממתינים</option>
        {HUB_GAP_KEYS.map((k) => <option key={k} value={k}>{GAP_LABELS[k]}</option>)}
      </select>

      <select aria-label="מכסת מסלולים" className={selectCls} value={filters.quota} onChange={(e) => onChange({ quota: e.target.value as HubFilters['quota'] })}>
        <option value="all">כל המכסות</option>
        <option value="below">מתחת למינימום</option>
        <option value="within">בטווח</option>
        <option value="above">מעל המקסימום</option>
      </select>

      <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-slate-700">
        <input type="checkbox" checked={filters.paying} onChange={(e) => onChange({ paying: e.target.checked })} className="accent-cyan-600" />
        לקוח משלם
      </label>
    </section>
  );
}
