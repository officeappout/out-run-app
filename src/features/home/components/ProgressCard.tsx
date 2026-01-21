"use client";

import React from 'react';
import { ChevronDown, Dumbbell, Lock } from 'lucide-react';

// שינוי ה-Interface כך שיהיה גמיש יותר ויקבל אובייקט עם שדות אופציונליים
interface ProgressCardProps {
  progress: {
    domain?: string;
    currentLevel?: number;
    maxLevel?: number;
    percentage?: number;
  } | null;
  isLocked?: boolean;
}

export default function ProgressCard({ progress, isLocked = false }: ProgressCardProps) {
  // אם נעול (לא סיים onboarding) - הצג Lock UI
  if (isLocked || !progress || progress.currentLevel === undefined || progress.currentLevel === 0) {
    return (
      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-50 flex items-center justify-between opacity-60">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-gray-900">
            <Dumbbell size={20} className="rotate-45" />
            <h3 className="text-[17px] font-black">רמה</h3>
          </div>
          
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-gray-400">נעול</span>
            <div className="flex items-center gap-1 text-[11px] text-gray-300 font-bold mt-1">
              <ChevronDown size={14} />
              <span>סיים את תהליך ההרשמה</span>
            </div>
          </div>
        </div>

        {/* Lock Icon */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 border-4 border-gray-200 flex items-center justify-center">
            <Lock size={24} className="text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  // חילוץ בטוח של הנתונים כדי למנוע שגיאות ריצה
  const label = progress.label || progress.domain || "התקדמות";
  const currentLevel = progress.currentLevel || 0;
  const totalLevels = progress.totalLevels || progress.maxLevel || 10;
  const percentage = progress.percentage || progress.progressPercent || 0;
  
  const remainingPercent = 100 - percentage;

  return (
    <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-50 flex items-center justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-900">
          <Dumbbell size={20} className="rotate-45" />
          <h3 className="text-[17px] font-black">{label}</h3>
        </div>
        
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-gray-400">
            רמה {currentLevel}/{totalLevels}
          </span>
          <div className="flex items-center gap-1 text-[11px] text-gray-300 font-bold mt-1">
            <ChevronDown size={14} />
            <span>עוד {remainingPercent}% לרמה {currentLevel + 1}</span>
          </div>
        </div>
      </div>

      {/* טבעת התקדמות */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="absolute w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="34" stroke="#F0F9FF" strokeWidth="8" fill="transparent" />
          <circle 
            cx="40" cy="40" r="34" 
            stroke="#4FB4F7" strokeWidth="8" 
            fill="transparent" 
            strokeDasharray="213.6" 
            strokeDashoffset={213.6 - (213.6 * (percentage / 100))} 
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <span className="text-lg font-black text-gray-900">{percentage}%</span>
      </div>
    </div>
  );
}