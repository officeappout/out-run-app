'use client';

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

// Light-theme palette for the metrics panel. The previous dark theme
// keyed every accent off `CYAN`; in light theme we want maximum contrast
// for the numbers (pure black) and a softer dark-gray for the labels.
const NUM_COLOR   = '#000000';
const LABEL_COLOR = 'rgba(0, 0, 0, 0.65)';
const HEADER_COLOR = 'rgba(0, 0, 0, 0.45)';
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

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

  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;
  const safePace = currentPace && isFinite(currentPace) && currentPace > 0 ? currentPace : 0;

  const distanceText = safeDistance.toFixed(2);
  const durationText = formatDuration(safeDuration);
  const paceText = formatPace(safePace);

  return (
    <div
      className="w-full px-5 pt-5 pb-4 flex flex-col justify-center"
      style={{ fontFamily: 'var(--font-simpler)', minHeight: '180px' }}
    >
      {/* Label row */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: HEADER_COLOR }}>
          נתונים כלליים
        </span>
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
      </div>

      {/* Hero distance */}
      <div className="text-center mb-4">
        <div
          className="leading-none tracking-tight font-black"
          style={{ fontSize: '5rem', color: NUM_COLOR }}
        >
          {distanceText}
        </div>
        <div className="text-xs font-bold mt-1 tracking-widest uppercase" style={{ color: LABEL_COLOR }}>
          קילומטר
        </div>
      </div>

      {/* Divider */}
      <div className="w-full mb-4" style={{ height: '1px', background: DIVIDER_COLOR }} />

      {/* Pace + Time row */}
      <div className="flex items-center justify-center">
        {/* Pace */}
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '1rem' }}
        >
          <div className="font-bold leading-none" style={{ fontSize: '2.4rem', color: NUM_COLOR }}>
            {paceText}
          </div>
          <div className="text-[11px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            קצב ממוצע
          </div>
        </div>

        {/* Time */}
        <div className="flex-1 text-center" style={{ paddingRight: '1rem' }}>
          <div className="font-bold leading-none" style={{ fontSize: '2.4rem', color: NUM_COLOR }}>
            {durationText}
          </div>
          <div className="text-[11px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            זמן
          </div>
        </div>
      </div>
    </div>
  );
}
