'use client';

/**
 * Push Performance tab (07.10.2026, push-performance instrumentation Step
 * 2 — scope-locked to (a)+(b), see the approved plan). Answers "which push
 * TYPE and which COPY VARIANT works best", a finer grain than
 * PushFunnelSection's existing sent→delivered→opened→started-workout
 * rollup, which this section sits alongside (not replaces) in the
 * Retention tab.
 *
 * Self-contained: owns its own filter state (channel + date range) and
 * fetch, via /api/admin/push-performance-summary — unlike this page's
 * other sections, which are all fed by state lifted to the parent
 * /admin/journey page. That's a deliberate difference, not an
 * inconsistency: this is the only section with filters of its own, not
 * shared with the page's JourneyFilterBar (same "push routes stay
 * unfiltered by the shared bar" reasoning PushFunnelSection/
 * CommitmentSurfacesSection/StatisticsSummary already follow — adding a
 * private filter pair here doesn't change that).
 *
 * Row list is DATA-DRIVEN from push-catalog.service.ts (the same shared
 * source admin/notifications/page.tsx now uses) joined against live
 * push_events aggregates — never a second hand-typed list of push types.
 * Unmeasured sources still appear, with every numeric cell reading "לא
 * נמדד" (never 0%) — see the API route's own header comment for the full
 * reasoning (refinement #2 of the approved plan).
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import type { PushPerformanceRow, PushPerformanceSummaryResponse } from '@/app/api/admin/push-performance-summary/route';
import { PUSH_CATALOG, type ChannelKey } from '@/features/admin/services/push-catalog.service';
import InfoHint from './InfoHint';

const toInputDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');
const fromInputDate = (s: string): Date | null => (s ? new Date(`${s}T00:00:00`) : null);

function formatCount(value: number | null, measured: boolean): string {
  if (!measured) return 'לא נמדד';
  if (value == null) return '—';
  return value.toLocaleString('he-IL');
}

function formatPct(value: number | null, measured: boolean): string {
  if (!measured) return 'לא נמדד';
  if (value == null) return '—';
  return `${value}%`;
}

function formatMinutes(value: number | null, measured: boolean): string {
  if (!measured) return 'לא נמדד';
  if (value == null) return '—';
  if (value < 60) return `${Math.round(value)} דק'`;
  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  return mins > 0 ? `${hours}:${String(mins).padStart(2, '0')} שעות` : `${hours} שעות`;
}

export default function PushPerformanceSection() {
  const [channel, setChannel] = useState<ChannelKey | ''>('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const [data, setData] = useState<PushPerformanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (dateFrom) params.set('dateFrom', dateFrom.toISOString());
    if (dateTo) params.set('dateTo', dateTo.toISOString());
    const qs = params.toString();
    const result = await adminAuthedFetch<PushPerformanceSummaryResponse>(
      `/api/admin/push-performance-summary${qs ? `?${qs}` : ''}`,
    );
    if (result.ok) { setData(result.data); setDenied(null); }
    else { setData(null); setDenied(result.message); }
    setLoading(false);
  }, [channel, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const rows: PushPerformanceRow[] = data?.rows ?? [];
  const measuredRows = rows.filter((r) => r.measured);
  const unmeasuredRows = rows.filter((r) => !r.measured);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shrink-0">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-1">
              ביצועי פוש — לפי סוג וגרסת תוכן
              <InfoHint text="כל שורה היא שילוב ספציפי של סוג פוש + גרסת תוכן (כותרת/גוף) שנשלחה בפועל. אחוזים הם 'משפך' — כל שלב מתוך השלב הקודם." />
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {denied ? denied : 'נשלחו → נמסרו % → נפתחו % → בוצעה פעולה % → זמן ממוצע לפעולה'}
            </p>
          </div>
        </div>

        {!denied && (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">סוג פוש</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ChannelKey | '')}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 min-w-[160px]"
              >
                <option value="">הכל</option>
                {PUSH_CATALOG.map((entry) => (
                  <option key={entry.channel} value={entry.channel}>{entry.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">מ-תאריך</label>
              <input
                type="date"
                value={toInputDate(dateFrom)}
                onChange={(e) => setDateFrom(fromInputDate(e.target.value))}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">עד-תאריך</label>
              <input
                type="date"
                value={toInputDate(dateTo)}
                onChange={(e) => setDateTo(fromInputDate(e.target.value))}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              רענן
            </button>
          </div>
        )}
      </div>

      {denied && (
        <div className="p-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{denied}</p>
        </div>
      )}

      {!denied && (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3">סוג פוש</th>
                <th className="px-6 py-3">גרסת תוכן</th>
                <th className="px-6 py-3">נשלחו</th>
                <th className="px-6 py-3">נמסרו (% מנשלחו)</th>
                <th className="px-6 py-3">נפתחו (% מנמסרו)</th>
                <th className="px-6 py-3">בוצעה פעולה (% מנפתחו)</th>
                <th className="px-6 py-3">זמן ממוצע לפעולה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-6 py-3">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-full max-w-md" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-sm text-slate-400">אין נתונים להצגה בטווח/בסינון שנבחר</td>
                </tr>
              ) : (
                <>
                  {measuredRows.map((row, i) => (
                    <tr key={`m_${row.funnelCategory}_${row.variantId}_${i}`}>
                      <td className="px-6 py-3 text-sm font-bold text-slate-900">
                        {row.entryLabel}
                        {row.sourceLabel && row.sourceLabel !== row.entryLabel && (
                          <span className="block text-xs font-normal text-slate-400">{row.sourceLabel}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600 font-mono max-w-[220px] truncate" title={row.variantId ?? ''}>
                        {row.variantId}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">{formatCount(row.sent, row.measured)}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{formatPct(row.deliveredPct, row.measured)}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{formatPct(row.openedPct, row.measured)}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{formatPct(row.actedPct, row.measured)}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{formatMinutes(row.avgTimeToActionMinutes, row.measured)}</td>
                    </tr>
                  ))}
                  {unmeasuredRows.map((row, i) => (
                    <tr key={`u_${row.channel}_${i}`} className="bg-slate-50/60">
                      <td className="px-6 py-3 text-sm font-bold text-slate-500">
                        {row.entryLabel}
                        {row.sourceLabel && row.sourceLabel !== row.entryLabel && (
                          <span className="block text-xs font-normal text-slate-400">{row.sourceLabel}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-400">—</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{formatCount(row.sent, row.measured)}</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{formatPct(row.deliveredPct, row.measured)}</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{formatPct(row.openedPct, row.measured)}</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{formatPct(row.actedPct, row.measured)}</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{formatMinutes(row.avgTimeToActionMinutes, row.measured)}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
