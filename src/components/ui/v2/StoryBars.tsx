'use client';

/**
 * StoryBars (v2) — one bar per session item, each in its OWN colour (the
 * block type), unlike the single-accent bars of the classic players. Done
 * bars are solid, the current bar is wider (`currentFlex`) and fills by
 * `progress`, upcoming bars are an empty track. Reads right-to-left.
 */

import React from 'react';

export interface StoryBarSegment {
  key: string;
  color: string;
}

export interface StoryBarsProps {
  segments: readonly StoryBarSegment[];
  /** Index of the current item; ≥ segments.length = all done. */
  currentIndex: number;
  /** 0–1 fill of the current bar. */
  progress: number;
  /** Width weight of the current bar vs 1 for the others. Default 3. */
  currentFlex?: number;
  className?: string;
}

export default function StoryBars({ segments, currentIndex, progress, currentFlex = 3, className = '' }: StoryBarsProps) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return (
    <div dir="ltr" className={`flex flex-row-reverse gap-1.5 ${className}`} aria-hidden>
      {segments.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div
            key={s.key}
            className="relative h-1.5 overflow-hidden rounded-full"
            style={{
              flex: current ? currentFlex : 1,
              background: 'rgba(14,27,42,0.10)',
              transition: 'flex 320ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            {done && <div className="absolute inset-0 rounded-full" style={{ background: s.color }} />}
            {current && (
              <div
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  // 1 % floor so the bar reads "live" the instant a block starts.
                  width: `${Math.max(1, p * 100)}%`,
                  background: s.color,
                  transition: 'width 0.9s linear',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
