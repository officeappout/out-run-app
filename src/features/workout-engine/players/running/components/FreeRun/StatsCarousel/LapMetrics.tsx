'use client';

import { Flag } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

const NUM_COLOR     = 'var(--metrics-num-color, #000000)';
const LABEL_COLOR   = 'var(--metrics-label-color, rgba(0, 0, 0, 0.65))';
const HEADER_COLOR  = 'var(--metrics-header-color, rgba(0, 0, 0, 0.45))';
const DIVIDER_COLOR = 'var(--metrics-divider-color, rgba(0, 0, 0, 0.08))';
const ACCENT_COLOR  = 'var(--metrics-accent-color, #00ADEF)';

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * LapMetrics — Slide 2 of the StatsCarousel.
 *
 * Shows ALL recorded laps (completed + current in-progress) as a scrollable
 * list: lap number | distance | time | pace. Newest lap first (current at top).
 * "עוד אין הקפות" placeholder when no laps exist yet.
 */
export default function LapMetrics() {
  const laps = useRunningPlayer((s) => s.laps);
  const autoLapMode = useRunningPlayer((s) => s.settings.autoLapMode);
  const autoLapValue = useRunningPlayer((s) => s.settings.autoLapValue);

  const hasLaps = Array.isArray(laps) && laps.length > 0;

  if (!hasLaps) {
    const lapSubtext =
      autoLapMode === 'distance'
        ? `תירשם אוטומטית כל ${autoLapValue} ק״מ`
        : autoLapMode === 'time'
        ? `תירשם אוטומטית כל ${autoLapValue} דקות`
        : "הקש על 'הקפה' כדי לסמן";

    return (
      <div
        className="flex flex-col items-center justify-center px-6 text-center"
        style={{ fontFamily: 'var(--font-simpler)', minHeight: '160px' }}
      >
        <Flag size={28} strokeWidth={1.5} style={{ color: ACCENT_COLOR, marginBottom: 10 }} />
        <p className="text-sm font-bold" style={{ color: NUM_COLOR }}>עוד אין הקפות</p>
        <p className="text-xs mt-1" style={{ color: LABEL_COLOR }}>{lapSubtext}</p>
      </div>
    );
  }

  // Newest lap first so current in-progress lap appears at the top.
  const sorted = [...laps].reverse();

  return (
    <div
      className="w-full flex flex-col"
      style={{ fontFamily: 'var(--font-simpler)', minHeight: '160px' }}
    >
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-2">
        <div className="h-px flex-grow max-w-[3rem]" style={{ background: DIVIDER_COLOR }} />
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: HEADER_COLOR }}>
          הקפות
        </span>
        <div className="h-px flex-grow max-w-[3rem]" style={{ background: DIVIDER_COLOR }} />
      </div>

      {/* Column headers */}
      <div
        className="grid px-4 pb-1"
        style={{ gridTemplateColumns: '2rem 1fr 1fr 1fr', columnGap: '0.5rem' }}
      >
        {['#', 'ק"מ', 'זמן', 'קצב'].map((h) => (
          <span
            key={h}
            className="text-[10px] font-bold text-center tracking-wide"
            style={{ color: LABEL_COLOR }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Scrollable lap list */}
      <div
        className="overflow-y-auto px-4 pb-3"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ maxHeight: 160, WebkitOverflowScrolling: 'touch' } as any}
      >
        {sorted.map((lap, idx) => {
          const isActive = !!lap.isActive;
          const distKm = ((lap.distanceMeters ?? 0) / 1000).toFixed(2);
          const time = fmtTime(lap.durationSeconds ?? 0);
          const pace = formatPace(lap.splitPace ?? 0);
          const lapNum = lap.lapNumber ?? (laps.length - idx);

          return (
            <div
              key={lap.id ?? String(lapNum)}
              className="grid py-1.5"
              style={{
                gridTemplateColumns: '2rem 1fr 1fr 1fr',
                columnGap: '0.5rem',
                borderTop: idx === 0 ? 'none' : `1px solid ${DIVIDER_COLOR}`,
              }}
            >
              {/* Lap number + active dot */}
              <div className="flex items-center justify-center gap-0.5">
                <span
                  className="text-[11px] font-black tabular-nums leading-none"
                  style={{ color: isActive ? ACCENT_COLOR : LABEL_COLOR }}
                >
                  {lapNum}
                </span>
                {isActive && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: ACCENT_COLOR, marginTop: 1 }}
                  />
                )}
              </div>

              {/* Distance */}
              <span
                className="text-[13px] font-bold tabular-nums text-center leading-none self-center"
                style={{ color: isActive ? NUM_COLOR : LABEL_COLOR }}
              >
                {distKm}
              </span>

              {/* Time */}
              <span
                className="text-[13px] font-bold tabular-nums text-center leading-none self-center"
                style={{ color: isActive ? NUM_COLOR : LABEL_COLOR }}
              >
                {time}
              </span>

              {/* Pace */}
              <span
                className="text-[13px] font-bold tabular-nums text-center leading-none self-center"
                style={{ color: isActive ? NUM_COLOR : LABEL_COLOR }}
              >
                {pace}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
