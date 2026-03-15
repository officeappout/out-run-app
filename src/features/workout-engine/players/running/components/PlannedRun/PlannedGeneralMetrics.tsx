'use client';

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';

export default function PlannedGeneralMetrics() {
  const { totalDistance, totalDuration } = useSessionStore();
  const {
    currentPaceFormatted,
    paceStatus,
    paceStatusColor,
  } = usePlannedRunEngine();

  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-6"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Title */}
      <div className="text-center" style={{ marginBottom: 8 }}>
        <span className="text-sm font-bold text-slate-500">סיכום כללי</span>
      </div>

      {/* Two big stats side-by-side: Distance | Time */}
      <div className="flex items-center justify-center w-full">
        <div className="flex-1 text-center">
          <div
            className="text-[2.5rem] font-black text-slate-800 leading-none tabular-nums"
            dir="ltr"
          >
            {safeDistance.toFixed(2)}
          </div>
          <div className="text-slate-400 text-xs font-medium" style={{ marginTop: 8 }}>
            קילומטר
          </div>
        </div>
        <div className="w-px h-12 bg-slate-200" />
        <div className="flex-1 text-center">
          <div
            className="text-[2.5rem] font-black text-slate-800 leading-none tabular-nums"
            dir="ltr"
          >
            {formatDuration(safeDuration)}
          </div>
          <div className="text-slate-400 text-xs font-medium" style={{ marginTop: 8 }}>
            זמן
          </div>
        </div>
      </div>

      {/* Current pace — smaller, below the two stats */}
      <div
        className="flex items-baseline justify-center gap-1"
        style={{ marginTop: 16 }}
        dir="ltr"
      >
        <span
          className="text-xl font-black tabular-nums"
          style={{ color: paceStatus !== 'idle' ? paceStatusColor : '#334155' }}
        >
          {currentPaceFormatted || '--:--'}
        </span>
        <span className="text-xs text-slate-400 font-medium">/ק״מ</span>
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
