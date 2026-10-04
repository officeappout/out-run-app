'use client';

import { TrendingUp } from 'lucide-react';

/**
 * "ליד הראשון" (04.10.2026, §13.86) — first of a category David expects
 * more of. Needs a real before/after snapshot per soldier, which only
 * exists once a soldier has test results from >=2 distinct test dates.
 * David, explicit: build this empty state for real, don't hide it and
 * don't invent a number — it fills in on its own, no design change,
 * once real second-test data exists.
 */
interface FailToPassTransitionCardProps {
  count: number | null;
  eligibleCount: number;
}

export default function FailToPassTransitionCard({ count, eligibleCount }: FailToPassTransitionCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
        <TrendingUp size={16} className="text-lime-700" />
        עברו מ&quot;לא כשיר&quot; ל&quot;כשיר&quot;
      </h3>

      {count === null ? (
        <>
          <p className="text-3xl font-black text-gray-300">—</p>
          <p className="text-xs text-gray-500 mt-1">דורש מבדק שני. אין עדיין אף חייל עם שני מבדקים.</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-black text-lime-700">{count}</p>
          <p className="text-xs text-gray-500 mt-1">מתוך {eligibleCount} חיילים עם שני מבדקים או יותר</p>
        </>
      )}
    </div>
  );
}
