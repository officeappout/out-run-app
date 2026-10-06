'use client';

import { Flame } from 'lucide-react';
import InfoHint from './InfoHint';

export interface StickinessData {
  dailyActiveUsers: number;
  weeklyActiveExercisers: number;
  monthlyActiveUsers: number;
  stickinessPct: number;
}

interface StickinessRowProps {
  data: StickinessData | null;
  loading?: boolean;
}

/**
 * Journey-hub Phase 0 (growth-analytics-plan.md §3). All 4 numbers come
 * from /api/admin/growth-metrics' existing `northStar` object — no new
 * route, no new fetch (the hub calls growth-metrics once; this component
 * just displays a slice of that one response). stickinessPct is computed
 * server-side as a true 30-day distinct-user union, not derived from
 * activeUsersTrend's per-day counts client-side — see the route's own
 * comment for why a client-side derivation from per-day counts would
 * double-count.
 *
 * Wave 2 (05.10.2026, approved wave plan) — the stickiness card gained
 * an actual visual meter against the target bands below the number,
 * replacing the text-only label that was here before (confirmed via
 * this task's gap-map: the DATA was always live, only the "meter with
 * target bands" visual treatment from the design was missing).
 * Band boundaries are unchanged from the original text-label logic —
 * only the rendering changed, not the thresholds.
 */
export default function StickinessRow({ data, loading }: StickinessRowProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  const dau = data?.dailyActiveUsers ?? 0;
  const wau = data?.weeklyActiveExercisers ?? 0;
  const mau = data?.monthlyActiveUsers ?? 0;
  const stickinessPct = data?.stickinessPct ?? 0;

  // Benchmark band per growth-analytics-plan.md §2.4: 20-30% solid,
  // >50% = daily-habit product. Owner-supplied, flagged there for a
  // source/recency check before being treated as authoritative.
  const bandLabel = stickinessPct >= 50 ? 'הרגל יומי' : stickinessPct >= 20 ? 'דביקות טובה' : 'מתחת לבנצ׳מרק';
  const bandColor = stickinessPct >= 50 ? 'text-emerald-600' : stickinessPct >= 20 ? 'text-cyan-600' : 'text-gray-500';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900">פעילות ודביקות</h2>
        <p className="text-gray-500 text-xs md:text-sm mt-1">פעילים יומי / שבועי / חודשי, ויחס הדביקות (DAU/MAU)</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <p className="text-xs md:text-sm text-gray-500 mb-1 flex items-center gap-1">
            פעילים יומי
            <InfoHint text="משתמשים עם אימון אמיתי אחד לפחות ביום האחרון שנמדד." />
          </p>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{dau.toLocaleString('he-IL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <p className="text-xs md:text-sm text-gray-500 mb-1 flex items-center gap-1">
            פעילים שבועי
            <InfoHint text="משתמשים עם אימון אמיתי אחד לפחות ב-7 הימים האחרונים." />
          </p>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{wau.toLocaleString('he-IL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <p className="text-xs md:text-sm text-gray-500 mb-1 flex items-center gap-1">
            פעילים חודשי
            <InfoHint text="משתמשים ייחודיים עם אימון אמיתי אחד לפחות ב-30 הימים האחרונים (איחוד אמיתי, לא סכימה של ימים)." />
          </p>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{mau.toLocaleString('he-IL')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs md:text-sm text-gray-500 flex items-center gap-1">
              דביקות
              <InfoHint text="יחס פעילים-יומי ÷ פעילים-חודשי — כמה מהמשתמשים הפעילים בחודש חוזרים כל יום." />
            </p>
            <Flame size={16} className={bandColor} />
          </div>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{stickinessPct}%</p>
          {/* Target-band meter — 0-20% gray (below benchmark), 20-50%
              cyan (good stickiness), 50%+ emerald (daily habit). A
              marker at the real value sits on top of the bands. */}
          <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mt-2.5" dir="ltr">
            <div className="absolute inset-y-0 bg-gray-200" style={{ left: 0, width: '20%' }} />
            <div className="absolute inset-y-0 bg-cyan-200" style={{ left: '20%', width: '30%' }} />
            <div className="absolute inset-y-0 bg-emerald-200" style={{ left: '50%', right: 0 }} />
            <div
              className="absolute inset-y-0 w-1 rounded-full bg-gray-900"
              style={{ left: `calc(${Math.min(100, Math.max(0, stickinessPct))}% - 2px)` }}
            />
          </div>
          <p className={`text-[11px] font-bold mt-1.5 ${bandColor}`}>{bandLabel} (בנצ׳מרק: 20-30%+)</p>
        </div>
      </div>
    </div>
  );
}
