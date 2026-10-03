'use client';

import type { DashboardOverallBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import { READINESS_COLORS } from './colors';

function LegendRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-[11px] text-gray-600">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-bold text-gray-700">{count}</span>
    </div>
  );
}

/**
 * Point 1 (locked): "טרם נבדק" is a PRIMARY datum, not a remainder.
 * Point 2: every percentage ships with its own denominator, in words.
 *
 * 03.10.2026 — David's visual-fix round, display only, no data/calc
 * change. The four-category split (prior correction) was right, but
 * rendering it as four EQUAL tiles buried the one number that matters
 * most — the overall pass rate. Restored: one headline percent ("X
 * מתוך Y" always attached — rule 2's own original example, "29 מתוך
 * 41", IS this exact card), a stacked bar + legend carrying the four
 * categories as supporting detail, then the red "still not tested"
 * line. not_performed keeps its own category from the prior
 * correction — never folded back into notYetTestedCount, including in
 * the warning line below (that line is specifically "who still needs a
 * test scheduled," and an exempt soldier isn't one of those).
 */
export default function OverallReadinessCard({ overall }: { overall: DashboardOverallBreakdown }) {
  const total = overall.totalCount;
  const notYetTestedPercent = total > 0 ? Math.round((overall.notYetTestedCount / total) * 1000) / 10 : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <h3 className="text-sm font-black text-gray-900 mb-3">כשירים מתוך שנבדקו</h3>

      {overall.passPercent === null ? (
        <p className="text-sm text-gray-400">אין עדיין נתונים</p>
      ) : (
        <>
          <p className="text-3xl font-black" style={{ color: READINESS_COLORS.pass }}>{overall.passPercent}%</p>
          <p className="text-xs text-gray-500 mt-1">{overall.passCount} מתוך {overall.testedCount}</p>
        </>
      )}

      {total > 0 && (
        <>
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mt-3 mb-3">
            <div style={{ width: `${(overall.passCount / total) * 100}%`, backgroundColor: READINESS_COLORS.pass }} />
            <div style={{ width: `${(overall.failCount / total) * 100}%`, backgroundColor: READINESS_COLORS.fail }} />
            <div style={{ width: `${(overall.notYetTestedCount / total) * 100}%`, backgroundColor: READINESS_COLORS.notYetTested }} />
            <div style={{ width: `${(overall.notPerformedCount / total) * 100}%`, backgroundColor: READINESS_COLORS.notPerformed }} />
          </div>

          <div className="space-y-1 mb-3">
            <LegendRow color={READINESS_COLORS.pass} label="כשיר" count={overall.passCount} />
            <LegendRow color={READINESS_COLORS.fail} label="לא כשיר" count={overall.failCount} />
            <LegendRow color={READINESS_COLORS.notYetTested} label="טרם נבדק" count={overall.notYetTestedCount} />
            <LegendRow color={READINESS_COLORS.notPerformed} label="פטור" count={overall.notPerformedCount} />
          </div>
        </>
      )}

      {notYetTestedPercent !== null && (
        <p className="text-[11px] font-bold mt-auto" style={{ color: READINESS_COLORS.fail }}>
          {notYetTestedPercent}% מהחטיבה עדיין לא נבדקו
        </p>
      )}
    </div>
  );
}
