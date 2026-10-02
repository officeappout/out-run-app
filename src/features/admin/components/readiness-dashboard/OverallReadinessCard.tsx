'use client';

import type { DashboardOverallBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';

/**
 * Point 1 (locked): "טרם נבדק" is a PRIMARY datum, not a remainder —
 * shown in the headline, as a number, and as a percentage, not implied
 * by subtraction. Point 2: every percentage ships with its own
 * denominator, stated in words — "29 מתוך 41", never a bare "72%".
 */
export default function OverallReadinessCard({ overall }: { overall: DashboardOverallBreakdown }) {
  const notTestedTotal = overall.notYetTestedCount + overall.notPerformedCount;
  const notTestedPercent = overall.totalCount > 0 ? Math.round((notTestedTotal / overall.totalCount) * 1000) / 10 : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-black text-gray-900 mb-1">סטטוס כשירות — החטיבה</h2>
      <p className="text-sm text-gray-500 mb-4">
        {overall.testedCount} מתוך {overall.totalCount} נבדקו
      </p>

      <div className="grid grid-cols-3 gap-3">
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
          <p className="text-2xl font-black" style={{ color: '#9A9C98' }}>{notTestedTotal}</p>
          <p className="text-xs font-bold mt-1" style={{ color: '#6b6d6a' }}>טרם נבדק</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {notTestedPercent !== null ? `${notTestedPercent}% מתוך ${overall.totalCount} סך הכל` : '—'}
          </p>
          {overall.notPerformedCount > 0 && (
            <p className="text-[9px] text-gray-400 mt-1">מתוכם {overall.notPerformedCount} עם פטור/אי-התייצבות</p>
          )}
        </div>
      </div>
    </div>
  );
}
