'use client';

/**
 * WorkoutStoryBars
 * Story-style progress bars for workout exercises.
 * The current bar fills from 0–100% over `activeBarDuration` seconds,
 * freezes when paused, and holds solid during rest.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import StoryBars, { type StoryBarSegment } from '@/components/ui/v2/StoryBars';

interface ProgressBar {
  isActive: boolean;
  isCurrent: boolean;
}

interface WorkoutStoryBarsProps {
  progressBars: ProgressBar[];
  accentColor?: string;
  /** Seconds for the active bar to fill (mirrors FillingButton autoCompleteTime) */
  activeBarDuration: number;
  isPaused: boolean;
  isResting: boolean;
  /** enable_home_v2 styling: navy-tinted track, v2 accent, no glow. Default false → today's look. */
  v2?: boolean;
}

export default function WorkoutStoryBars({
  progressBars,
  accentColor: accentColorProp,
  activeBarDuration,
  isPaused,
  isResting,
  v2 = false,
}: WorkoutStoryBarsProps) {
  const accentColor = accentColorProp ?? (v2 ? '#00baf7' : '#00AEEF');
  const trackColor = v2 ? 'rgba(14, 27, 42, 0.10)' : 'rgba(0, 0, 0, 0.15)';
  const barGlow = v2 ? 'none' : `0 0 6px ${accentColor}80`;
  const safeDuration = (!activeBarDuration || activeBarDuration <= 0) ? 10 : activeBarDuration;

  const [fillProgress, setFillProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const currentBarIndex = progressBars.findIndex((b) => b.isCurrent);

  // Reset fill when the active bar changes (new exercise)
  useEffect(() => {
    setFillProgress(0);
    startTimeRef.current = null;
    pausedElapsedRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [currentBarIndex, safeDuration]);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / safeDuration, 1);
    setFillProgress(progress);
    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [safeDuration]);

  useEffect(() => {
    if (isPaused || isResting) {
      // Freeze: save elapsed so far and stop the loop
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (startTimeRef.current) {
        pausedElapsedRef.current = Date.now() - startTimeRef.current;
      }
      return;
    }

    // Resume or start: rebase startTime so elapsed picks up where it left off
    startTimeRef.current = Date.now() - pausedElapsedRef.current;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, isResting, tick]);

  if (v2) {
    // enable_home_v2: the shared v2 StoryBars (one implementation app-wide);
    // the props reproduce this header's v2 look exactly (single accent, no
    // glow, no 1 % floor, Tailwind transition-all 300 ms on each bar).
    const segments: StoryBarSegment[] = progressBars.map((bar, index) => ({
      key: String(index),
      color: accentColor,
      state: bar.isCurrent ? 'current' : bar.isActive ? 'done' : 'upcoming',
    }));
    return (
      <StoryBars
        segments={segments}
        currentIndex={currentBarIndex}
        progress={isResting ? 1 : fillProgress}
        minFillPercent={0}
        trackColor={trackColor}
        glow={barGlow}
        fillTransition={isPaused ? 'none' : 'width 0.1s linear'}
        segmentTransition="all 300ms cubic-bezier(0.4, 0, 0.2, 1)"
      />
    );
  }

  // Flag off: the pre-v2 markup, unchanged.
  return (
    <div className="flex flex-row-reverse gap-1.5" dir="ltr">
      {progressBars.map((bar, index) => {
        const isCurrentBar = bar.isCurrent;
        const completed = bar.isActive && !bar.isCurrent;

        return (
          <div
            key={index}
            className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300"
            style={{
              flex: isCurrentBar ? 3 : 1,
              backgroundColor: trackColor,
            }}
          >
            {/* Completed bars — solid fill */}
            {completed && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: barGlow,
                }}
              />
            )}

            {/* Current bar — animated fill (RTL: fills right-to-left) */}
            {isCurrentBar && (
              <div
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  width: isResting ? '100%' : `${fillProgress * 100}%`,
                  backgroundColor: accentColor,
                  boxShadow: barGlow,
                  transition: isPaused ? 'none' : 'width 0.1s linear',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
