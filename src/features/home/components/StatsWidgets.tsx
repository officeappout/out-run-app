"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Zap, Flame, Lock } from 'lucide-react';

// הגדרת ה-Props בצורה שתתאים ל-MOCK_STATS שלך
interface StatsWidgetsProps {
  stats: {
    minutes: number;
    steps: number;
    calories: number;
  };
  emphasizeSteps?: boolean;
  isGuest?: boolean;
}

export default function StatsWidgets({ stats, emphasizeSteps = true, isGuest = false }: StatsWidgetsProps) {
  const router = useRouter();

  // הגנה למקרה ש-stats מגיע undefined מה-Mock
  if (!stats) return null;

  const minProgress = (stats.minutes / 150) * 100;
  // וידוא שהאחוז לא עובר את ה-100 לטובת ה-UI
  const minBarWidth = Math.min(minProgress, 100);

  return (
    <div className="grid grid-cols-2 gap-4 w-full">
      {/* Level Trigger (for Guest) OR Weekly Goal (for User) */}
      {isGuest ? (
        <div
          onClick={() => router.push('/onboarding')}
          className="bg-white rounded-[32px] p-5 shadow-sm border border-orange-100/50 flex flex-col items-center justify-center min-h-[165px] cursor-pointer active:scale-95 transition-transform relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-full h-1 bg-orange-400/20" />

          <div className="w-16 h-16 rounded-full bg-orange-50 border-4 border-orange-100 flex items-center justify-center mb-3 text-2xl font-black text-orange-300">
            ?
          </div>
          <p className="text-[13px] font-bold text-gray-900 text-center leading-tight">לחץ להגדרת<br />רמה</p>
          <div className="mt-2 bg-orange-50 px-3 py-1 rounded-full">
            <Lock size={12} className="text-orange-400" />
          </div>
        </div>
      ) : (
        /* כרטיס דקות פעילות - רגיל */
        <div className="bg-white rounded-[32px] p-5 shadow-sm border border-gray-50 flex flex-col justify-between min-h-[165px]">
          <div>
            <Heart size={18} className="text-gray-300 mb-3" />
            <h3 className="text-[13px] font-black text-gray-900 mb-1">יעד שבועי</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-gray-900">{stats.minutes}</span>
              <span className="text-xs font-bold text-gray-400">/ 150</span>
            </div>
          </div>
          <div className="mt-auto">
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#4FB4F7] h-full rounded-full transition-all duration-1000"
                style={{ width: `${minBarWidth}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-2 font-bold tracking-tight">דקות פעילות</p>
          </div>
        </div>
      )}

      {/* כרטיס צעדים */}
      <div className="bg-white rounded-[32px] p-5 shadow-sm border border-gray-50 flex flex-col items-center justify-center min-h-[165px]">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg className="absolute w-full h-full -rotate-90">
            <circle cx="48" cy="48" r="38" stroke="#F0F9FF" strokeWidth="7" fill="transparent" />
            <circle
              cx="48" cy="48" r="38"
              stroke="#4FB4F7" strokeWidth="7"
              fill="transparent"
              strokeDasharray="239"
              strokeDashoffset={239 - (239 * Math.min(stats.steps / 8000, 1))}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <Zap size={22} className="text-[#4FB4F7]" fill="currentColor" />
        </div>
        <div className="text-center mt-3">
          <p className="text-[11px] font-black text-gray-900 leading-tight">צעדים היום</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <Flame size={12} className="text-orange-500" fill="currentColor" />
            <span className="text-sm font-black text-gray-900">{stats.steps}</span>
          </div>
          <p className="text-[9px] font-bold text-gray-400 mt-0.5">מתוך 8,000</p>
        </div>
      </div>
    </div>
  );
}