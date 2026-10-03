'use client';

import type { DashboardOverallBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';

function pctOfTotal(n: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((n / total) * 1000) / 10}% מתוך ${total} סך הכל`;
}

/**
 * Point 1 (locked): "טרם נבדק" is a PRIMARY datum, not a remainder —
 * shown in the headline, as a number, and as a percentage, not implied
 * by subtraction. Point 2: every percentage ships with its own
 * denominator, stated in words — "29 מתוך 41", never a bare "72%".
 *
 * 03.10.2026 — David's correction: "טרם נבדק" and "פטור" are FOUR
 * separate categories, not three. Merging them (the original version of
 * this card) corrupts the one number an officer actually acts on —
 * "טרם נבדק" must contain ONLY people a test can still be scheduled for.
 * A merged number mixes in people with a recorded exemption, who the
 * officer cannot do anything about — "פעם אחת זה בזבוז. פעמיים הוא
 * מפסיק להאמין למספר." `notPerformedCount` is its own box, own count,
 * own percent-of-total — never folded into notYetTestedCount, and never
 * reduced to a sub-note under it. Same color as "טרם נבדק" (#9A9C98 —
 * matching ReadinessStatusBadge's own precedent: 'not_performed' and
 * 'not_yet_tested' already share this grey there, distinguished by
 * label, never by merging the count), different label.
 */
export default function OverallReadinessCard({ overall }: { overall: DashboardOverallBreakdown }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-black text-gray-900 mb-1">סטטוס כשירות — החטיבה</h2>
      <p className="text-sm text-gray-500 mb-4">
        {overall.testedCount} מתוך {overall.totalCount} נבדקו
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#0E5A4210' }}>
          <p className="text-2xl font-black" style={{ color: '#0E5A42' }}>{overall.passCount}</p>
          <p className="text-xs font-bold mt-1" style={{ color: '#0E5A42' }}>כשיר</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {overall.passPercent !== null ? `${overall.passPercent}% מתוך ${overall.testedCount} שנבדקו` : 'אין עדיין נתונים'}
          </p>
        </div>

        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#D9541F10' }}>
          <p className="text-2xl font-black" style={{ color: '#D9541F' }}>{overall.failCount}</p>
          <p className="text-xs font-bold mt-1" style={{ color: '#D9541F' }}>לא כשיר</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {overall.testedCount > 0 ? `${Math.round((overall.failCount / overall.testedCount) * 1000) / 10}% מתוך ${overall.testedCount} שנבדקו` : 'אין עדיין נתונים'}
          </p>
        </div>

        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#9A9C9820' }}>
          <p className="text-2xl font-black" style={{ color: '#6b6d6a' }}>{overall.notYetTestedCount}</p>
          <p className="text-xs font-bold mt-1" style={{ color: '#6b6d6a' }}>טרם נבדק</p>
          <p className="text-[10px] text-gray-500 mt-1">{pctOfTotal(overall.notYetTestedCount, overall.totalCount)}</p>
        </div>

        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#9A9C9820' }}>
          <p className="text-2xl font-black" style={{ color: '#6b6d6a' }}>{overall.notPerformedCount}</p>
          <p className="text-xs font-bold mt-1" style={{ color: '#6b6d6a' }}>פטור</p>
          <p className="text-[10px] text-gray-500 mt-1">{pctOfTotal(overall.notPerformedCount, overall.totalCount)}</p>
        </div>
      </div>
    </div>
  );
}
