'use client';

import { useMemo } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

// Light-theme palette — mirrors `MainMetrics.tsx` so swiping between the
// two slides looks like one cohesive surface. Cyan accent maps to the
// `out-cyan` token (#00ADEF) in `tailwind.config.ts`.
const NUM_COLOR     = '#000000';
const LABEL_COLOR   = 'rgba(0, 0, 0, 0.65)';
const HEADER_COLOR  = 'rgba(0, 0, 0, 0.45)';
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';
const ACCENT_COLOR  = '#00ADEF';

const formatTime = (seconds: number | undefined | null): string => {
  const s = seconds ?? 0;
  if (!s || s < 0 || !isFinite(s)) return '00:00';
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * LapMetrics — Slide 2 of the StatsCarousel ("הקפה נוכחית").
 *
 * NEVER returns null / empty. If `laps` is missing or the session is idle,
 * we still render the full triplet UI with zeros so the user always sees a
 * visible "Lap 1 — 0.00 km — 00:00 — 00:00" surface. The fallback path
 * draws a subtle dashed cyan outline so QA can visually distinguish
 * "no-lap-data fallback" from "real lap with all-zero values."
 */
export default function LapMetrics() {
  const laps = useRunningPlayer((s) => s.laps);
  const status = useSessionStore((s) => s.status);

  // Always returns a usable object — empty laps fall through to the
  // zero-valued fallback rather than blanking the UI.
  const activeLap = useMemo(() => {
    if (!Array.isArray(laps) || laps.length === 0) {
      return {
        lapNumber: 1,
        distanceMeters: 0,
        durationSeconds: 0,
        splitPace: 0,
        __fallback: true as const,
      };
    }
    return (
      laps.find((l) => l?.isActive) ??
      laps[laps.length - 1] ?? {
        lapNumber: 1,
        distanceMeters: 0,
        durationSeconds: 0,
        splitPace: 0,
        __fallback: true as const,
      }
    );
  }, [laps]);

  const lapNumber = activeLap?.lapNumber ?? 1;
  const lapDistKm = ((activeLap?.distanceMeters ?? 0) / 1000).toFixed(2);
  const lapPace = formatPace(activeLap?.splitPace ?? 0);
  const lapTime = formatTime(activeLap?.durationSeconds);
  const isFallback = '__fallback' in activeLap;

  return (
    <div
      className="w-full px-5 pt-5 pb-4 flex flex-col justify-center"
      style={{
        fontFamily: 'var(--font-simpler)',
        minHeight: '180px',
        // ── DEBUG marker ─────────────────────────────────────────────
        // Subtle dashed cyan border ONLY when the fallback path renders
        // (no laps in store). Lets the user verify visually that the
        // slide is mounting even when the store hasn't been seeded yet.
        // Remove once the data-flow regression is fixed.
        ...(isFallback
          ? { outline: '2px dashed rgba(0, 173, 239, 0.45)', outlineOffset: -4 }
          : {}),
      }}
      data-testid="lap-metrics"
      data-fallback={isFallback ? 'true' : 'false'}
      data-status={status}
    >
      {/* Label row */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: HEADER_COLOR }}>
          הקפה נוכחית
          {isFallback ? ' [DEBUG]' : ''}
        </span>
        <div className="h-px flex-grow max-w-[4rem]" style={{ background: DIVIDER_COLOR }} />
      </div>

      {/* Hero lap number */}
      <div className="text-center mb-4">
        <div
          className="leading-none tracking-tight font-black tabular-nums"
          style={{ fontSize: '5rem', color: NUM_COLOR }}
        >
          {lapNumber}
        </div>
        <div className="text-xs font-bold mt-1 tracking-widest uppercase" style={{ color: ACCENT_COLOR }}>
          הקפה
        </div>
      </div>

      {/* Divider */}
      <div className="w-full mb-4" style={{ height: '1px', background: DIVIDER_COLOR }} />

      {/* Three-column stats */}
      <div className="flex items-center justify-center">
        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.5rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {lapDistKm}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            ק"מ
          </div>
        </div>

        <div
          className="flex-1 text-center"
          style={{ borderLeft: `1px solid ${DIVIDER_COLOR}`, paddingLeft: '0.5rem' }}
        >
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {lapPace}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            קצב
          </div>
        </div>

        <div className="flex-1 text-center" style={{ paddingRight: '0.5rem' }}>
          <div className="font-bold leading-none tabular-nums" style={{ fontSize: '2rem', color: NUM_COLOR }}>
            {lapTime}
          </div>
          <div className="text-[10px] font-bold mt-1 tracking-wide" style={{ color: LABEL_COLOR }}>
            זמן
          </div>
        </div>
      </div>
    </div>
  );
}
