import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Zap, Mountain } from 'lucide-react';
import { SUCCESS_BASELINE } from '@/features/user/progression/services/smart-goals.service';

interface FloorsWidgetProps {
  floors: number;
  goal: number;
}

export const FloorsWidget: React.FC<FloorsWidgetProps> = ({
  floors = 0,
  goal = 3,
}) => {
  // Calculate ratios (0 to 1)
  const ratio = Math.min(Math.max(floors / goal, 0), 1);
  const percentage = Math.round(ratio * 100);
  const isGoalReached = floors >= goal;
  const isBaselineReached = floors >= SUCCESS_BASELINE.floors;

  // Baseline marker position
  const baselinePosition = (SUCCESS_BASELINE.floors / goal) * 100;

  return (
    <div
      className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex flex-col justify-between h-36 relative border border-gray-100 dark:border-gray-800 overflow-hidden w-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-start z-10">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">קומות היום</span>
        <Mountain className="text-purple-500 w-5 h-5" />
      </div>

      <div className="flex items-center justify-between mt-2 z-10">
        {/* Animated SVG Circle */}
        <div className="relative w-16 h-16">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            {/* Background Track */}
            <path
              className="text-gray-100 dark:text-gray-700"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            
            {/* Baseline Marker (subtle) */}
            {baselinePosition < 100 && (
              <motion.path
                className="text-amber-300 dark:text-amber-700"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray={`${(baselinePosition / 100) * 100} 100`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: baselinePosition / 100 }}
                transition={{ duration: 1, delay: 0.2 }}
              />
            )}
            
            {/* Progress Fill (Accurate) */}
            <motion.path
              className={
                isGoalReached
                  ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                  : isBaselineReached
                  ? 'text-amber-400 drop-shadow-sm'
                  : 'text-purple-500 drop-shadow-sm'
              }
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: ratio }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isGoalReached ? (
              <TrendingUp className="text-emerald-400 w-5 h-5" />
            ) : (
              <Zap className="text-purple-500 w-5 h-5 fill-current" />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1">
            <span className="text-2xl font-extrabold text-gray-900 dark:text-white">
              {floors}
            </span>
            {isGoalReached && (
              <span className="text-lg">🎯</span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            מתוך {goal}
          </span>
          {!isGoalReached && isBaselineReached && (
            <span className="text-[10px] text-amber-500 font-semibold mt-0.5">
              בסיס הושג ✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
