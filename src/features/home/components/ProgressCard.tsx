"use client";

/**
 * ProgressCard Component
 * 
 * Displays user's level progression with concentric activity rings.
 * Shows both level progress and daily activity breakdown.
 */

import React from 'react';
import { ChevronDown, Dumbbell, Lock, TrendingUp } from 'lucide-react';
import { ConcentricRingsProgress, CompactRingsProgress } from './rings/ConcentricRingsProgress';
import { useDailyActivity } from '@/features/activity';

// Interface for the progress data
interface ProgressCardProps {
  progress: {
    domain?: string;
    label?: string;
    currentLevel?: number;
    maxLevel?: number;
    totalLevels?: number;
    percentage?: number;
    progressPercent?: number;
  } | null;
  isLocked?: boolean;
  /** Show concentric rings instead of single progress ring */
  showActivityRings?: boolean;
  /** Compact mode - smaller card */
  compact?: boolean;
}

export default function ProgressCard({ 
  progress, 
  isLocked = false,
  showActivityRings = true,
  compact = false,
}: ProgressCardProps) {
  const { ringData, totalMinutesToday, streak, isLoading: activityLoading } = useDailyActivity();
  
  // Locked state (hasn't completed onboarding)
  if (isLocked || !progress || progress.currentLevel === undefined || progress.currentLevel === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-card border border-gray-50 dark:border-slate-700 flex items-center justify-between opacity-60">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
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
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-700 border-4 border-gray-200 dark:border-slate-600 flex items-center justify-center">
            <Lock size={24} className="text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  // Extract data safely
  const label = progress.label || progress.domain || "התקדמות";
  const currentLevel = progress.currentLevel || 0;
  const totalLevels = progress.totalLevels || progress.maxLevel || 10;
  const percentage = progress.percentage || progress.progressPercent || 0;
  const remainingPercent = 100 - percentage;

  // Compact card layout
  if (compact) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-50 dark:border-slate-700 flex items-center gap-4">
        {/* Compact Rings */}
        <CompactRingsProgress ringData={ringData} />
        
        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white mb-1">
            <TrendingUp size={14} className="text-primary" />
            <span className="text-sm font-bold truncate">רמה {currentLevel}</span>
          </div>
          <p className="text-[10px] text-gray-400 truncate">
            {totalMinutesToday > 0 ? `${totalMinutesToday} דק' היום` : 'התחל לאמן!'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-card border border-gray-50 dark:border-slate-700">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Dumbbell size={20} className="rotate-45" />
            <h3 className="text-[17px] font-black">{label}</h3>
          </div>
          
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-gray-400">
              רמה {currentLevel}/{totalLevels}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-gray-300 dark:text-gray-500 font-bold mt-1">
              <ChevronDown size={14} />
              <span>עוד {remainingPercent}% לרמה {currentLevel + 1}</span>
            </div>
          </div>
        </div>
        
        {/* Streak badge */}
        {streak > 0 && (
          <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-full">
            <span className="text-orange-500">🔥</span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{streak}</span>
          </div>
        )}
      </div>

      {/* Progress visualization */}
      <div className="flex justify-center">
        {showActivityRings ? (
          <ConcentricRingsProgress
            size={140}
            strokeWidth={10}
            showCenter={true}
            centerMode="percentage"
            showLegend={true}
            animationDuration={0.8}
          />
        ) : (
          /* Original single ring */
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
            <span className="text-lg font-black text-gray-900 dark:text-white">{percentage}%</span>
          </div>
        )}
      </div>
      
      {/* Today's activity summary */}
      {totalMinutesToday > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-50 dark:border-slate-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-bold text-gray-700 dark:text-gray-200">{totalMinutesToday} דקות</span> פעילות היום
          </p>
        </div>
      )}
    </div>
  );
}