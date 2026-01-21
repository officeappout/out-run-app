import React from 'react';

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
  const ratio = Math.min(Math.max(weeklyDistance / weeklyGoal, 0), 1);
  const percentage = Math.round(ratio * 100);

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 dark:border-gray-800 w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">ריצה שבועית</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{percentage}%</span>
      </div>
      <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
        {weeklyDistance.toFixed(1)} ק״מ
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        מתוך {weeklyGoal} ק״מ • {calories} קל׳
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

