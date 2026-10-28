import { withUnit } from '@/lib/i18n/units';
import { common } from '@/messages/ns/common';
import { useT } from '@/hooks/useT';
import React from 'react';
import { home } from '@/messages/ns/home';

interface RunningStatsWidgetProps {
  weeklyDistance: number;
  weeklyGoal: number;
  calories: number;
}

export const RunningStatsWidget: React.FC<RunningStatsWidgetProps> = ({
  weeklyDistance,
  weeklyGoal,
  calories,
}) => {
  const tc = useT(common);
  const tx = useT(home);
  const ratio = Math.min(Math.max(weeklyDistance / weeklyGoal, 0), 1);
  const percentage = Math.round(ratio * 100);

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 dark:border-gray-800 w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{tx('sweep.runningStats.title')}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{percentage}%</span>
      </div>
      <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
        {withUnit('km', weeklyDistance.toFixed(1), tc)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {tx('sweep.runningStats.of', { goal: withUnit('km', weeklyGoal, tc), calories })}
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mt-3 overflow-hidden">
        <div
          className="h-2 rounded-full bg-gradient-to-l from-[#00C9F2] to-[#00E5FF] transition-all duration-700"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

