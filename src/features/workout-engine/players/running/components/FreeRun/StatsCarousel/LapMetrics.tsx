'use client';

import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

const NUM_COLOR     = 'var(--metrics-num-color, #000000)';
const LABEL_COLOR   = 'var(--metrics-label-color, rgba(0, 0, 0, 0.65))';
const HEADER_COLOR  = 'var(--metrics-header-color, rgba(0, 0, 0, 0.45))';
const DIVIDER_COLOR = 'var(--metrics-divider-color, rgba(0, 0, 0, 0.08))';
const ACCENT_COLOR  = 'var(--metrics-accent-color, #00ADEF)';

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * LapMetrics — Slide 2 of StatsCarousel.
 *
 * Mirrors the MainMetrics layout exactly (hero number + label + 3 secondary
 * columns). Data source = the current active lap, live-updating. Resets
 * automatically when triggerLap() pushes a new active lap.
 */
export default function LapMetrics() {
  const laps = useRunningPlayer((s) => s.laps);

  const activeLap = laps.find((l) => l.isActive) ?? laps[laps.length - 1] ?? null;
  const lapNumber  = activeLap?.lapNumber ?? (activeLap as any)?.number ?? laps.length;
  const distKm     = (activeLap?.distanceMeters ?? 0) / 1000;
  const durationSec = activeLap?.durationSeconds ?? (activeLap as any)?.duration ?? 0;
  const pace       = activeLap?.splitPace ?? 0;

  return (
    <div
      className="w-full px-5 pt-3 pb-3 flex flex-col justify-center"
      style={{ fontFamily: 'var(--font-simpler)', minHeight: '160px' }}
    >
      {/* Label row — mirrors MainMetrics */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: HEADER_COLOR }}>
          הקפה {lapNumber}
        </span>
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
      </div>

      {/* Hero metric — lap distance */}
      <div className="text-center mb-2">
        <div
          className="leading-none tracking-tight font-black tabular-nums"
          style={{ fontSize: '5rem', color: NUM_COLOR }}
        >
          {distKm.toFixed(2)}
        </div>
        <div className="text-xs font-bold mt-0.5 tracking-widest uppercase" style={{ color: LABEL_COLOR }}>
          קילומטר
        </div>
      </div>

      {/* Divider */}
      <div className="w-full mb-2" style={{ height: '1px', background: DIVIDER_COLOR }} />

      {/* Secondary metrics row — same 3-column grid as MainMetrics */}
      <div className="flex items-center justify-center">
        {/* Pace */}
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.75rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {formatPace(pace)}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            קצב
          </div>
        </div>

        {/* Duration */}
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.75rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {fmtDuration(durationSec)}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            זמן
          </div>
        </div>

        {/* Lap number badge */}
        <div className="flex-1 text-center" style={{ paddingRight: '0.75rem' }}>
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: ACCENT_COLOR }}>
            {lapNumber}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            הקפה
          </div>
        </div>
      </div>
    </div>
  );
}
