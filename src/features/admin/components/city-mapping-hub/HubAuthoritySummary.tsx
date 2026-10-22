'use client';

/**
 * HubAuthoritySummary — the selected authority's headline numbers + every gap
 * with its one-line "why / what to do" (the full actionable gaps panel is wave
 * H4). Read-only.
 */
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import { GAP_HINTS, GAP_LABELS, LEVEL_DOT, NOT_MEASURED, TYPE_LABELS, dateText, pctText } from './hub-display';

export default function HubAuthoritySummary({ row, onClear }: { row: HubRow | null; onClear: () => void }) {
  if (!row) {
    return <p className="p-4 text-sm font-semibold text-slate-400">בחר רשות בטבלה כדי לראות את הפערים שלה.</p>;
  }
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="hub-summary">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-black">{row.name}</h3>
        <span className="text-xs font-semibold text-slate-400">{TYPE_LABELS[row.authorityType] ?? row.authorityType}{row.isActiveClient ? ' · לקוח משלם' : ''}</span>
        {row.level ? (
          <span className="inline-flex items-center gap-1 text-sm font-extrabold"><i className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[row.level]}`} />{row.score}</span>
        ) : (
          <span className="text-xs font-bold text-slate-400">{NOT_MEASURED}</span>
        )}
        <button type="button" onClick={onClear} className="ms-auto rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">נקה בחירה</button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
        <div><dt className="text-slate-500">מסלולים מאושרים</dt><dd className="font-bold tabular-nums">{row.approvedRoutes} / {row.quota.min}–{row.quota.max}</dd></div>
        <div><dt className="text-slate-500">מסלולים ממתינים</dt><dd className="font-bold tabular-nums">{row.pendingRoutes}</dd></div>
        <div><dt className="text-slate-500">מיקומים ממתינים</dt><dd className="font-bold tabular-nums">{row.pendingParks}</dd></div>
        <div><dt className="text-slate-500">תרומות ממתינות</dt><dd className="font-bold tabular-nums">{row.pendingContributions}</dd></div>
        <div><dt className="text-slate-500">צל</dt><dd className="font-bold">{pctText(row.shadeCoveragePct)}</dd></div>
        <div><dt className="text-slate-500">תאורה</dt><dd className="font-bold">{pctText(row.lightingCoveragePct)}</dd></div>
        <div><dt className="text-slate-500">רענון אחרון</dt><dd className="font-bold">{dateText(row.lastRefreshAt)}</dd></div>
      </dl>
      {row.gaps.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="פערים">
          {row.gaps.map((g) => (
            <li key={g} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
              <b className="font-extrabold">{GAP_LABELS[g]}</b>
              <span className="block text-slate-600">{GAP_HINTS[g]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-emerald-700">אין פערים ידועים.</p>
      )}
    </div>
  );
}
