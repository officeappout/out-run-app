'use client';

import { CalendarClock } from 'lucide-react';
import type { CommitmentSurfacesSummary } from '@/app/api/admin/commitment-surfaces-summary/route';
import InfoHint from './InfoHint';

export type { CommitmentSurfacesSummary };

interface Stat {
  key: keyof CommitmentSurfacesSummary;
  labelHe: string;
  windowHe: string;
  hintHe: string;
}

const STATS: Stat[] = [
  { key: 'remindersSetOrUpdated30d', labelHe: 'תזכורות נקבעו/עודכנו', windowHe: '30 יום', hintHe: 'משתמשים שקבעו או עדכנו תזכורת אימון בחלון הזמן.' },
  { key: 'scheduleEntriesWithTime7d', labelHe: 'ערכי לו״ז עם שעה', windowHe: '7 ימים', hintHe: 'רשומות לו״ז עם שעה מוגדרת (לא רק יום).' },
  { key: 'plannedSessionsCreated7d', labelHe: '"יוצא להתאמן" (+ במפה)', windowHe: '7 ימים', hintHe: 'לחיצות "יוצא להתאמן" או תכנון אימון דרך המפה.' },
  { key: 'groupCheckIns7d', labelHe: 'צ׳ק-אין קבוצתי ("אני כאן!")', windowHe: '7 ימים', hintHe: 'משתמשים שסימנו "אני כאן!" בצ׳ק-אין קבוצתי.' },
];

interface CommitmentSurfacesSectionProps {
  data: CommitmentSurfacesSummary | null;
  loading: boolean;
  denied: string | null;
}

/**
 * Scheduling/commitment surfaces visibility (scheduling-capability-audit.md
 * Part A, item 4) — the uniformly-missing, uniformly-cheap admin-panel gap
 * that audit flagged: zero analytics/panel visibility existed on any of the
 * 6 audited "pick a time / schedule / check-in" surfaces. A null value for
 * any one card means that specific query failed (likely a missing index,
 * e.g. the group-check-in collectionGroup query) — not that the count is
 * actually zero; rendered as "—" to keep the two cases visually distinct.
 */
export default function CommitmentSurfacesSection({ data, loading, denied }: CommitmentSurfacesSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-sm shrink-0">
          <CalendarClock size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">משטחי מחויבות וזמן</h2>
          <p className="text-sm text-slate-500 mt-1">
            {denied ?? 'כמה משתמשים בוחרים זמן / קובעים / מודיעים שהם מגיעים'}
          </p>
        </div>
      </div>

      {!denied && (
        <div className="flex gap-3 overflow-x-auto px-6 py-5">
          {STATS.map(({ key, labelHe, windowHe, hintHe }) => {
            const value = data?.[key];
            return (
              <div key={key} className="shrink-0 min-w-[170px] rounded-2xl p-4 border-2 border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-600 inline-flex items-center gap-1">
                  {labelHe}
                  <InfoHint text={hintHe} />
                </span>
                <div className="text-2xl font-black text-slate-900 mt-2">
                  {loading ? (
                    <span className="inline-block w-12 h-7 bg-slate-200 rounded animate-pulse" />
                  ) : value == null ? (
                    '—'
                  ) : (
                    value.toLocaleString('he-IL')
                  )}
                </div>
                <div className="mt-2 text-xs font-bold text-slate-400">{windowHe}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
