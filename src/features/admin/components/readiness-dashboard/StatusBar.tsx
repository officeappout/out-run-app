'use client';

import type { DashboardUnitStatusBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import { READINESS_COLORS } from './colors';

/**
 * 06.10.2026 — extracted verbatim from UnitReadinessTable.tsx (zero
 * behavior change) so the Command screen (all-brigades/battalion/
 * company cards) can reuse the EXACT same bar, not a visual
 * reimplementation. David's rule: training data must look identical
 * everywhere it appears — "מקווקו, כמו בעמודת תמונת האימון" — which
 * only a shared component can guarantee by construction.
 */
export function UnitStatusBar({
  breakdown,
  totalCount,
  variant = 'official',
}: {
  breakdown: DashboardUnitStatusBreakdown;
  totalCount: number;
  /**
   * 06.10.2026 (David, verbatim) — 'training' renders visually
   * SUBORDINATE to the official bar: dashed outline + lower
   * height/opacity, the SAME visual language as the dashed blue line in
   * the trends chart (TrendsMainChart.tsx:117-128, legend "אפליקציה
   * (אינדיקציה, לא קובע)") — dashed = app-derived indication, solid =
   * official test result. Colors stay pass/fail/grey either way; only
   * the bar's visual weight changes, never its palette.
   */
  variant?: 'official' | 'training';
}) {
  const isTraining = variant === 'training';
  const heightClass = isTraining ? 'h-1' : 'h-2';
  const fillOpacity = isTraining ? 0.55 : 1;
  const wrapperClass = isTraining ? 'p-0.5 rounded-full border border-dashed border-slate-300' : '';
  // Rule 3, unchanged from the previous round: nobody evaluated under
  // this view at all — solid grey, no split between the categories,
  // no percentage anywhere near it.
  if (breakdown.testedCount === 0 && breakdown.notPerformedCount === 0) {
    return (
      <div className={wrapperClass}>
        <div className={`${heightClass} rounded-full w-full`} style={{ backgroundColor: READINESS_COLORS.notYetTested, opacity: fillOpacity }} />
      </div>
    );
  }
  const denom = totalCount || 1;
  return (
    <div className={wrapperClass}>
      <div className={`flex ${heightClass} rounded-full overflow-hidden bg-gray-100 w-full`} style={{ opacity: fillOpacity }}>
        <div style={{ width: `${(breakdown.passCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.pass }} />
        <div style={{ width: `${(breakdown.failCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.fail }} />
        <div style={{ width: `${(breakdown.notYetTestedCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.notYetTested }} />
        <div style={{ width: `${(breakdown.notPerformedCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.notPerformed }} />
      </div>
    </div>
  );
}
