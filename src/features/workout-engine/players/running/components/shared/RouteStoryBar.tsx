'use client';

/**
 * RouteStoryBar — single-segment goal-progress bar for free-run sessions.
 * ----------------------------------------------------------------------
 * Visual sibling of `RunStoryBar` (used by PlannedRunActive's multi-block
 * carousel) but condensed to ONE full-width segment. Intended to be
 * mounted at the top of the metrics card inside `AdaptiveMetricsWrapper`
 * so the user reads "X% to my goal" the same way Stories surface
 * "X% through this story".
 *
 * Visual language (matches RunStoryBar):
 *   • Track height            : 6 px (h-1.5)
 *   • Track colour            : #E2E8F0 (slate-200)
 *   • Fill rounding           : rounded-full
 *   • Fill glow               : `0 0 6px ${color}80` — same recipe as
 *                                completed segments in RunStoryBar.
 *   • Pause behaviour         : RAF loop is cancelled, fill freezes at
 *                                the last value (mirrors RunStoryBar).
 *
 * The fill is RAF-driven for buttery smoothness even when the upstream
 * `progress` only updates once a second (totalDistance / totalDuration
 * tick at 1 Hz). The render itself stays pure — `targetProgressRef`
 * is updated synchronously on every prop change, the RAF loop pulls
 * the latest value into local state without re-rendering the parent.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface RouteStoryBarProps {
  /** 0–1, clamped by the caller (see useSessionGoalProgress). */
  progress: number;
  /**
   * Fill colour. Defaults to the app's `out-cyan` (#00ADEF) — the same
   * accent used for the active-block fill in RunStoryBar.
   */
  color?: string;
  /** When true, the RAF loop is cancelled and the fill freezes. */
  isPaused?: boolean;
  /**
   * Optional label rendered above the bar — e.g. "מרחק" / "זמן" /
   * "קלוריות". Kept optional so the bar stays usable as a pure
   * progress indicator in contexts that don't need a label.
   */
  label?: string;
  /**
   * Optional value text rendered above the bar on the opposite side
   * from `label` — e.g. "2.4 / 5 ק״מ". Hidden if undefined.
   */
  valueText?: string;
}

const DEFAULT_COLOR = '#00ADEF'; // out-cyan token

export default function RouteStoryBar({
  progress,
  color = DEFAULT_COLOR,
  isPaused = false,
  label,
  valueText,
}: RouteStoryBarProps) {
  const [fillProgress, setFillProgress] = useState(progress);
  const rafRef = useRef<number | null>(null);
  const targetProgressRef = useRef(progress);
  targetProgressRef.current = progress;

  const tick = useCallback(() => {
    setFillProgress(targetProgressRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (isPaused) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, tick]);

  // Width as percent — clamped here too as a belt-and-braces against
  // a caller that forgot to clamp upstream.
  const widthPct = Math.max(0, Math.min(1, fillProgress)) * 100;

  return (
    <div
      className="w-full px-4 pt-2 pb-1.5"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {(label || valueText) && (
        <div className="flex items-center justify-between mb-1.5">
          {label ? (
            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
              {label}
            </span>
          ) : (
            <span />
          )}
          {valueText ? (
            <span
              className="text-[11px] font-black tabular-nums text-slate-700"
              dir="ltr"
            >
              {valueText}
            </span>
          ) : (
            <span />
          )}
        </div>
      )}

      <div
        className="relative h-1.5 rounded-full overflow-hidden w-full"
        style={{ backgroundColor: '#E2E8F0' }}
      >
        {/* Single-segment fill. `right-0` so the bar grows from the
            right edge in the RTL container — visually mirrors how a
            Hebrew reader expects "progress" to flow. */}
        <div
          className="absolute inset-y-0 right-0 rounded-full"
          style={{
            width: `${widthPct}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}80`,
            transition: isPaused ? 'none' : 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}
