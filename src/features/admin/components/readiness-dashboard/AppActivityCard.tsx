'use client';

import { Smartphone } from 'lucide-react';

/**
 * "פעילים באפליקציה" (04.10.2026, §13.86). Denominator is EVERY soldier
 * in scope, not just linked ones — David, explicit: a linked-only
 * denominator would look great and say nothing; "half the battalion
 * trains" is the useful statement. The "מתוכם N מקושרים" sub-line is
 * NOT decoration — without it, "not training" and "not yet linked" are
 * indistinguishable.
 */
interface AppActivityCardProps {
  totalCount: number;
  linkedCount: number;
  activeCount: number;
  activePercent: number | null;
  windowDays: number;
}

export default function AppActivityCard({ totalCount, linkedCount, activeCount, activePercent, windowDays }: AppActivityCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
        <Smartphone size={16} className="text-cyan-600" />
        פעילים באפליקציה
      </h3>

      {activePercent === null ? (
        <p className="text-sm text-gray-400">אין עדיין חיילים ברשימה</p>
      ) : (
        <>
          <p className="text-3xl font-black text-cyan-700">{activePercent}%</p>
          <p className="text-xs text-gray-500 mt-1">{activeCount} מתוך {totalCount} · {windowDays} יום</p>
        </>
      )}

      <p className="text-[11px] font-bold text-slate-500 mt-3 pt-2 border-t border-slate-100">
        מתוכם {linkedCount} מקושרים לחשבון
      </p>
    </div>
  );
}
