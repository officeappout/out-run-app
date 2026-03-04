'use client';

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';

export default function PlannedGeneralMetrics() {
  const { totalDistance, totalDuration } = useSessionStore();
  const {
    currentPaceFormatted,
    showNumbers,
    paceStatus,
    paceStatusColor,
    targetZoneLabel,
  } = usePlannedRunEngine();

  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;

  return (
    <div
      className="w-full min-h-[180px] flex flex-col justify-center"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Divider with title */}
      <div className="flex items-center justify-center gap-4 mb-2">
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]" />
        <span className="text-gray-400 text-sm font-medium">נתונים כלליים</span>
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]" />
      </div>

      {/* Large current pace */}
      <div className="text-center mb-4">
        {showNumbers ? (
          <>
            <div
              className="text-[4.5rem] font-black leading-none tracking-tight"
              style={{ color: paceStatus !== 'idle' ? paceStatusColor : '#000' }}
              dir="ltr"
            >
              {currentPaceFormatted || '0:00'}
            </div>
            <div className="text-gray-500 text-sm mt-1">קצב נוכחי</div>
          </>
        ) : (
          <>
            <div className="text-[3rem] font-black text-gray-900 leading-none">
              {targetZoneLabel || '—'}
            </div>
            <div className="text-gray-500 text-sm mt-1">אזור נוכחי</div>
          </>
        )}
      </div>

      {/* Horizontal Divider */}
      <div className="h-[1px] bg-gray-200 w-full mb-4" />

      {/* Two Columns: Distance (right) and Time (left) */}
      <div className="flex items-center justify-center">
        <div className="flex-1 text-center border-l border-gray-300 pl-4">
          <div className="text-[2.5rem] font-bold text-black leading-none" dir="ltr">
            {safeDistance.toFixed(2)}
          </div>
          <div className="text-gray-500 text-xs mt-1">קילומטר</div>
        </div>
        <div className="flex-1 text-center pr-4">
          <div className="text-[2.5rem] font-bold text-black leading-none" dir="ltr">
            {formatDuration(safeDuration)}
          </div>
          <div className="text-gray-500 text-xs mt-1">זמן</div>
        </div>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
