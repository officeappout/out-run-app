'use client';

import { Activity, Dumbbell } from 'lucide-react';

export interface NorthStarData {
  weeklyActiveExercisers: number;
  workoutsPerActiveUser: number;
}

interface NorthStarRowProps {
  data: NorthStarData | null;
  loading?: boolean;
}

/**
 * Analytics v2 Phase 1 (04.10.2026). Deliberately 2 tiles, not more —
 * D7 retention and resurrected-users are explicitly deferred (see the
 * 04.10.2026 audit doc), not stubbed here as "0" or "ממתין לנתונים",
 * since that would read as real data rather than "not built yet".
 */
export default function NorthStarRow({ data, loading }: NorthStarRowProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
    );
  }

  const weeklyActiveExercisers = data?.weeklyActiveExercisers ?? 0;
  const workoutsPerActiveUser = data?.workoutsPerActiveUser ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900">מדדי צפון (North-Star)</h2>
        <p className="text-gray-500 text-xs md:text-sm mt-1">מבוססים על אימונים אמיתיים — לא על רצף (streak), בגלל פער דיוק ידוע של כ-47%</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 md:p-3 rounded-lg bg-cyan-50">
              <Activity size={20} className="text-cyan-600 md:w-6 md:h-6" />
            </div>
          </div>
          <p className="text-xs md:text-sm text-gray-500 mb-1">מתאמנים פעילים השבוע</p>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{weeklyActiveExercisers.toLocaleString('he-IL')}</p>
          <p className="text-[11px] text-gray-400 mt-1">משתמשים עם אימון אחד לפחות ב-7 הימים האחרונים</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 md:p-3 rounded-lg bg-orange-50">
              <Dumbbell size={20} className="text-orange-600 md:w-6 md:h-6" />
            </div>
          </div>
          <p className="text-xs md:text-sm text-gray-500 mb-1">אימונים למתאמן פעיל</p>
          <p className="text-2xl md:text-3xl font-black text-gray-900">{workoutsPerActiveUser.toLocaleString('he-IL')}</p>
          <p className="text-[11px] text-gray-400 mt-1">אימונים ב-7 הימים האחרונים ÷ מתאמנים פעילים</p>
        </div>
      </div>
    </div>
  );
}
