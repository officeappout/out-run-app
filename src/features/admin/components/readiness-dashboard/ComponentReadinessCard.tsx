'use client';

import type { DashboardComponentBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import { READINESS_COLORS } from './colors';

function formatThreshold(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'seconds') return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  return String(value);
}

/**
 * Point 2: denominator always stated, in words, next to the percentage.
 *
 * 03.10.2026 — David's visual-fix round: equal-size card in the SAME
 * row as OverallReadinessCard, not a smaller second-row tile. Title,
 * threshold subtitle, big percent, "X מתוך Y עוברים", then a slim
 * pass/fail bar scaled over testedCount — the only split this service
 * computes per component (no untested segment here; that figure
 * doesn't exist at the component level, only at the brigade/unit
 * level).
 */
export default function ComponentReadinessCard({ component }: { component: DashboardComponentBreakdown }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <h3 className="text-sm font-black text-gray-900">{component.label}</h3>
      <p className="text-[11px] text-gray-400 mb-3">
        סף: {formatThreshold(component.thresholdMale, component.unit)} (גברים) · {formatThreshold(component.thresholdFemale, component.unit)} (נשים)
      </p>

      {component.passPercent === null ? (
        <p className="text-sm text-gray-400">אין עדיין נתונים</p>
      ) : (
        <>
          <p className="text-3xl font-black" style={{ color: READINESS_COLORS.pass }}>{component.passPercent}%</p>
          <p className="text-xs text-gray-500 mt-1">{component.passCount} מתוך {component.testedCount} עוברים</p>
        </>
      )}

      {component.testedCount > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-3">
          <div style={{ width: `${(component.passCount / component.testedCount) * 100}%`, backgroundColor: READINESS_COLORS.pass }} />
          <div style={{ width: `${(component.failCount / component.testedCount) * 100}%`, backgroundColor: READINESS_COLORS.fail }} />
        </div>
      )}
    </div>
  );
}
