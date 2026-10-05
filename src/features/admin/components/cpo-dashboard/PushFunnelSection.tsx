'use client';

import { Send } from 'lucide-react';
import type {
  PushFunnelStageCounts,
  PushFunnelCategoryBreakdown,
} from '@/app/api/admin/push-funnel-summary/route';

export interface PushFunnelSummaryResponse {
  overall: PushFunnelStageCounts;
  byCategory: PushFunnelCategoryBreakdown[];
  measuredSenderCount: number;
}

const PUSH_FUNNEL_STAGE_LABELS: { key: keyof PushFunnelStageCounts; labelHe: string }[] = [
  { key: 'sent', labelHe: 'נשלחו' },
  { key: 'delivered', labelHe: 'נמסרו' },
  { key: 'opened', labelHe: 'נפתחו' },
  { key: 'startedWorkout', labelHe: 'התחילו אימון' },
];

interface PushFunnelSectionProps {
  data: PushFunnelSummaryResponse | null;
  loading: boolean;
  denied: string | null;
}

/**
 * Push → action funnel (Analytics v2 Phase 1, 04.10.2026). Extracted from
 * /admin/analytics' inline JSX (journey-hub Phase 0) so both that page and
 * the new /admin/journey hub mount the SAME component instead of a second
 * copy — see growth-analytics-plan.md §3's "reuse, don't rebuild" rule.
 *
 * Separate funnel, separate data source (push_events, not users) — sent →
 * delivered → opened → started a workout. Retained-7d (the brief's 5th
 * stage) is explicitly deferred, see .claude/knowledge/analytics-
 * retention-dashboard-audit-2026-10-04.md. Only the 3-of-12 senders that
 * currently call sendPush() with `measurement` appear here — a real,
 * current data-coverage limit, not a bug.
 */
export default function PushFunnelSection({ data, loading, denied }: PushFunnelSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm shrink-0">
          <Send size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">משפך פוש → פעולה</h2>
          <p className="text-sm text-slate-500 mt-1">
            {denied
              ? denied
              : `נשלח → נמסר → נפתח → התחיל אימון · ${data?.measuredSenderCount ?? 0} סוגי פוש נמדדים כיום (מתוך 12)`}
          </p>
        </div>
      </div>

      {!denied && (
        <>
          <div className="flex gap-3 overflow-x-auto px-6 py-5">
            {PUSH_FUNNEL_STAGE_LABELS.map(({ key, labelHe }, i) => {
              const count = data?.overall[key] ?? 0;
              const prevCount = i === 0 ? null : (data?.overall[PUSH_FUNNEL_STAGE_LABELS[i - 1].key] ?? 0);
              const stepPct = prevCount != null && prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null;
              return (
                <div
                  key={key}
                  className="shrink-0 min-w-[150px] rounded-2xl p-4 border-2 border-slate-200 bg-white"
                >
                  <span className="text-xs font-bold text-slate-600">{labelHe}</span>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {loading ? (
                      <span className="inline-block w-12 h-7 bg-slate-200 rounded animate-pulse" />
                    ) : (
                      count.toLocaleString('he-IL')
                    )}
                  </div>
                  {stepPct != null && (
                    <div className="mt-2 text-xs font-bold text-emerald-600">{stepPct}% מהשלב הקודם</div>
                  )}
                </div>
              );
            })}
          </div>

          {!loading && (data?.byCategory.length ?? 0) > 0 && (
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full text-right">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3">קטגוריה</th>
                    <th className="px-6 py-3">נשלחו</th>
                    <th className="px-6 py-3">נמסרו</th>
                    <th className="px-6 py-3">נפתחו</th>
                    <th className="px-6 py-3">התחילו אימון</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data!.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td className="px-6 py-3 text-sm font-bold text-slate-900">{row.category}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.sent.toLocaleString('he-IL')}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.delivered.toLocaleString('he-IL')}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.opened.toLocaleString('he-IL')}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.startedWorkout.toLocaleString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
