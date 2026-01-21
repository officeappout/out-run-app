import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Timer } from 'lucide-react';

interface WeeklyActivityWidgetProps {
  currentMinutes: number;
  weeklyGoal: number;
  activityCount: number;
}

export const WeeklyActivityWidget: React.FC<WeeklyActivityWidgetProps> = ({
  currentMinutes = 0,
  weeklyGoal = 150,
  activityCount = 0,
}) => {
  const percentage = Math.min((currentMinutes / weeklyGoal) * 100, 100);

  return (
    <div
      className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex flex-col justify-between h-36 border border-gray-100 dark:border-gray-800 w-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">יעד שבועי</span>
        <Heart className="text-gray-400 w-5 h-5" />
      </div>

      {/* Content */}
      <div className="mt-2 flex-grow flex flex-col justify-center">
        {/* Numbers */}
        <div className="flex items-end gap-1">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {currentMinutes}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            / {weeklyGoal}
          </span>
        </div>

        {/* Linear Progress Bar */}
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 mt-2 relative overflow-hidden">
          <motion.div
            className="bg-gradient-to-l from-[#00C9F2] to-[#00E5FF] h-full rounded-full absolute top-0 right-0 shadow-[0_0_15px_rgba(0,201,242,0.3)]"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1 }}
          />
        </div>

        {/* Footer Text */}
        <div className="text-xs text-gray-400 mt-2 text-left" dir="ltr">
          {activityCount} activities
        </div>
      </div>
    </div>
  );
};

