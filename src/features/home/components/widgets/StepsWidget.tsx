import React from 'react';
import { motion } from 'framer-motion';
import { Footprints, Flame, Zap } from 'lucide-react';
import { SUCCESS_BASELINE } from '@/features/user/progression/services/smart-goals.service';

interface StepsWidgetProps {
  steps: number;
  goal: number;
  calories?: number;
}

export const StepsWidget: React.FC<StepsWidgetProps> = ({
  steps = 0,
  goal = 8000,
  calories = 0,
}) => {
  // Calculate ratio (0 to 1) for pathLength
  const ratio = Math.min(Math.max(steps / goal, 0), 1);
  const percentage = Math.round(ratio * 100);
  const isGoalReached = steps >= goal;
  const isBaselineReached = steps >= SUCCESS_BASELINE.steps;

  // Baseline marker position
  const baselinePosition = (SUCCESS_BASELINE.steps / goal) * 100;

  return (
    <div
      className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex flex-col justify-between h-36 relative border border-gray-100 dark:border-gray-800 overflow-hidden w-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-start z-10">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">צעדים היום</span>
        <Footprints className="text-[#00C9F2] w-5 h-5 transform -scale-x-100" />
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
            
            {/* Baseline Marker (subtle gray line at 1500 steps) */}
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
                  : 'text-[#00C9F2] drop-shadow-sm'
              }
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: ratio }} // Takes 0-1 value
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="text-[#00C9F2] w-5 h-5 fill-current" />
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1">
            <span className="text-2xl font-extrabold text-gray-900 dark:text-white">
              {steps.toLocaleString()}
            </span>
            {isGoalReached ? (
              <span className="text-lg">🎯</span>
            ) : (
              <Flame className="text-orange-500 w-4 h-4 animate-pulse" />
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            מתוך {goal.toLocaleString()}
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

