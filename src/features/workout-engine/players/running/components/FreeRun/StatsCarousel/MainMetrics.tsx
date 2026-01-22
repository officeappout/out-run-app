'use client';

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

export default function MainMetrics() {
  const { totalDistance, totalDuration } = useSessionStore();
  const { currentPace } = useRunningPlayer();

  const formatDuration = (totalSeconds: number): string => {
    if (!totalSeconds || totalSeconds <= 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Safe data formatting
  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;
  const safePace = currentPace && isFinite(currentPace) && currentPace > 0 ? currentPace : 0;

  const distanceText = safeDistance.toFixed(2);
  const durationText = formatDuration(safeDuration);
  const paceText = formatPace(safePace);

  return (
    <div className="w-full min-h-[180px] flex flex-col justify-center" style={{ fontFamily: 'Assistant, sans-serif' }}>
      {/* Divider with "נתונים כלליים" */}
      <div className="flex items-center justify-center gap-4 mb-2">
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
        <span className="text-gray-400 text-sm font-medium">נתונים כלליים</span>
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
      </div>

      {/* Huge Distance */}
      <div className="text-center mb-4">
        <div className="text-[4.5rem] font-black text-black leading-none tracking-tight">
          {distanceText}
        </div>
        <div className="text-gray-500 text-sm mt-1">קילומטר</div>
      </div>

      {/* Horizontal Divider */}
      <div className="h-[1px] bg-gray-200 w-full mb-4"></div>

      {/* Two Columns: Pace (left) and Time (right) */}
      <div className="flex items-center justify-center">
        <div className="flex-1 text-center border-l border-gray-300 pl-4">
          <div className="text-[2.5rem] font-bold text-black leading-none">
            {paceText}
          </div>
          <div className="text-gray-500 text-xs mt-1">קצב ממוצע</div>
        </div>
        <div className="flex-1 text-center pr-4">
          <div className="text-[2.5rem] font-bold text-black leading-none">
            {durationText}
          </div>
          <div className="text-gray-500 text-xs mt-1">זמן</div>
        </div>
      </div>
    </div>
  );
}
