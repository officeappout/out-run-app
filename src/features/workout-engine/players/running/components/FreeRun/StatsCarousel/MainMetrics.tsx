'use client';

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

const NUM_COLOR     = 'var(--metrics-num-color, #000000)';
const LABEL_COLOR   = 'var(--metrics-label-color, rgba(0, 0, 0, 0.65))';
const HEADER_COLOR  = 'var(--metrics-header-color, rgba(0, 0, 0, 0.45))';
const DIVIDER_COLOR = 'var(--metrics-divider-color, rgba(0, 0, 0, 0.08))';

export default function MainMetrics() {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const currentPace = useRunningPlayer((s) => s.currentPace);
  const totalCalories = useRunningPlayer((s) => s.totalCalories);

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

  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;
  const safePace = currentPace && isFinite(currentPace) && currentPace > 0 ? currentPace : 0;
  const safeCalories = totalCalories && isFinite(totalCalories) && totalCalories > 0 ? Math.round(totalCalories) : 0;

  return (
    <div
      className="w-full px-5 pt-3 pb-3 flex flex-col justify-center"
      style={{ fontFamily: 'var(--font-simpler)', minHeight: '160px' }}
    >
      {/* Label row */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: HEADER_COLOR }}>
          נתונים כלליים
        </span>
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
      </div>

      {/* Hero distance */}
      <div className="text-center mb-2">
        <div
          className="leading-none tracking-tight font-black"
          style={{ fontSize: '5rem', color: NUM_COLOR }}
        >
          {safeDistance.toFixed(2)}
        </div>
        <div className="text-xs font-bold mt-0.5 tracking-widest uppercase" style={{ color: LABEL_COLOR }}>
          קילומטר
        </div>
      </div>

      {/* Divider */}
      <div className="w-full mb-2" style={{ height: '1px', background: DIVIDER_COLOR }} />

      {/* Pace / Time / Calories — three columns */}
      <div className="flex items-center justify-center">
        {/* Pace */}
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.75rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {formatPace(safePace)}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            קצב ממוצע
          </div>
        </div>

        {/* Time */}
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.75rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {formatDuration(safeDuration)}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            זמן
          </div>
        </div>

        {/* Calories */}
        <div className="flex-1 text-center" style={{ paddingRight: '0.75rem' }}>
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {safeCalories}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            קק״ל
          </div>
        </div>
      </div>
    </div>
  );
}
