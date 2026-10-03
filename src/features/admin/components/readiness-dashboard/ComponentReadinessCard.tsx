'use client';

import type { DashboardComponentBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';

function formatThreshold(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'seconds') return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  return String(value);
}

/** Point 2: denominator always stated, in words, next to the percentage. */
export default function ComponentReadinessCard({ component }: { component: DashboardComponentBreakdown }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-black text-gray-900 mb-3">{component.label}</h3>
      {component.passPercent === null ? (
        <p className="text-sm text-gray-400">אין עדיין נתונים</p>
      ) : (
        <>
          <p className="text-2xl font-black" style={{ color: '#0E5A42' }}>{component.passPercent}%</p>
          <p className="text-xs text-gray-500 mt-1">{component.passCount} מתוך {component.testedCount} עוברים את הסף</p>
        </>
      )}
      <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
        סף: {formatThreshold(component.thresholdMale, component.unit)} (גברים) · {formatThreshold(component.thresholdFemale, component.unit)} (נשים)
      </p>
    </div>
  );
}
