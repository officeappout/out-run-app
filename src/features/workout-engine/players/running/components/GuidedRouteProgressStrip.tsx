'use client';

/**
 * GuidedRouteProgressStrip
 * ------------------------
 * Compact light-theme overlay that surfaces guided-route context during an
 * active workout: route name + linear progress bar + percent complete.
 *
 * Reads:
 *   - useRunningPlayer: guidedRouteName, guidedRouteDistanceKm
 *   - useSessionStore:  totalDistance (km), status
 *
 * Positioning: sits below the TurnCarousel (which is at top safe-area + ~76 px
 * tall, z-[60]). This strip uses z-40 so the carousel stays on top, but it
 * floats above the FreeRunActive header (z-30) and the map.
 *
 * Visual language: light theme — solid white surface, black text, primary
 * blue progress bar, soft elevation shadow. Zero glass / no backdrop-filter.
 * Mirrors TurnCarousel + the metrics card.
 *
 * Hidden when no guided-route metadata is set — i.e. it never renders for free
 * runs or planned interval workouts, even if the component is mounted.
 */

import React from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { useSessionStore } from '../../../core/store/useSessionStore';

const PRIMARY = '#0EA5E9';
const PRIMARY_DARK = '#0284C7';

export default function GuidedRouteProgressStrip() {
  const guidedRouteName = useRunningPlayer((s) => s.guidedRouteName);
  const guidedRouteDistanceKm = useRunningPlayer((s) => s.guidedRouteDistanceKm);
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const status = useSessionStore((s) => s.status);

  if (!guidedRouteName) return null;
  if (status !== 'active' && status !== 'paused') return null;

  const totalKm = guidedRouteDistanceKm ?? 0;
  const progressPct = totalKm > 0
    ? Math.max(0, Math.min(100, (totalDistance / totalKm) * 100))
    : 0;
  const progressLabel = totalKm > 0 ? `${Math.round(progressPct)}%` : '—';

  return (
    <div
      className="absolute left-4 right-4 z-40 pointer-events-none"
      style={{ top: 'calc(max(1rem, env(safe-area-inset-top, 0px)) + 5.5rem)' }}
      dir="rtl"
    >
      <div
        className="mx-auto max-w-sm rounded-2xl px-4 py-2.5 pointer-events-auto bg-white"
        style={{
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-black text-[12px] font-black truncate flex-1 min-w-0">
            {guidedRouteName}
          </p>
          <p
            className="text-[12px] font-black tabular-nums flex-shrink-0"
            style={{ color: PRIMARY_DARK }}
            dir="ltr"
          >
            {progressLabel}
          </p>
        </div>

        <div
          className="relative h-1.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(0, 0, 0, 0.06)' }}
          aria-label="התקדמות במסלול"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          <div
            className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(to left, ${PRIMARY}, ${PRIMARY_DARK})`,
            }}
          />
        </div>

        {totalKm > 0 && (
          <div className="flex items-center justify-between mt-1.5">
            <span
              className="text-[10px] font-bold tabular-nums"
              dir="ltr"
              style={{ color: 'rgba(0, 0, 0, 0.55)' }}
            >
              {totalDistance.toFixed(2)} / {totalKm.toFixed(2)} ק&quot;מ
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
