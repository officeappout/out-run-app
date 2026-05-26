'use client';

/**
 * RestProgressBar — Shared Lego.
 *
 * Inline horizontal countdown panel used both by solo
 * `StrengthExerciseCard` (between straight-set rounds) and by
 * `SupersetBlockGroup` (at the bottom of the paired frame).  Pure
 * presentation — owns no timer, just renders a width-percentage
 * progress overlay + the formatted seconds left + a skip button.
 *
 * Visual blueprint matches the main-screen rest indicator so the
 * playlist's per-card bar is identical to what David sees on the
 * Big Screen during rest.
 */

import React from 'react';
import { SkipForward } from 'lucide-react';

export interface RestProgressBarProps {
  /** Seconds left in the current rest interval (undefined → bar full). */
  restTimeLeft?: number;
  /** mm:ss formatter from the workout-timers hook. */
  formatTime?: (s: number) => string;
  /** Total rest duration the bar started at — drives the % width. */
  totalRest: number;
  /** Optional skip-rest handler.  Hides the button when omitted. */
  onSkip?: () => void;
  /**
   * Extra Tailwind utilities for the outer container, allowing
   * callers to override the default `mx-3 mb-3` spacing (the solo
   * card uses tighter inner margins than the superset frame).
   */
  className?: string;
}

export default function RestProgressBar({
  restTimeLeft,
  formatTime,
  totalRest,
  onSkip,
  className,
}: RestProgressBarProps) {
  const isEnding = restTimeLeft !== undefined && restTimeLeft <= 10;
  const progress =
    restTimeLeft !== undefined
      ? Math.max(0, Math.min(100, (restTimeLeft / totalRest) * 100))
      : 100;

  return (
    <div
      className={[
        'relative overflow-hidden h-[36px] rounded-[8px] transition-all duration-500',
        isEnding ? 'bg-white' : 'bg-[#BFEEFD]',
        className ?? 'mx-3 mb-3',
      ].join(' ')}
      style={{
        border: isEnding
          ? '1px solid rgba(255,138,0,0.1)'
          : '0.5px solid #00BAF7',
      }}
    >
      <div
        className="absolute inset-y-0 right-0 rounded-[8px]"
        style={{
          width: `${progress}%`,
          backgroundColor: isEnding ? '#FF8A00' : '#00BAF7',
          transition: 'width 1s linear, background-color 0.5s ease',
        }}
      />
      <div className="relative z-10 flex items-center justify-between h-full px-4">
        <div className="flex items-center gap-2">
          <span
            className={[
              'text-sm font-bold tabular-nums transition-colors duration-500',
              isEnding ? 'text-[#FF8A00]' : 'text-slate-800',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {restTimeLeft !== undefined && formatTime
              ? formatTime(restTimeLeft)
              : formatTime?.(totalRest) ?? '00:30'}
          </span>
          <span
            className="text-xs text-slate-500"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מנוחה
          </span>
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/60 active:bg-white/90 transition-colors"
          >
            <span
              className="text-[11px] font-bold text-slate-700"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              דלג
            </span>
            <SkipForward
              size={13}
              className="text-slate-700"
              strokeWidth={2.5}
            />
          </button>
        )}
      </div>
    </div>
  );
}
