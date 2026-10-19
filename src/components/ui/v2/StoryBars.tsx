'use client';

/**
 * StoryBars (v2) — the ONE story-style segmented progress bar (live players,
 * the strength runner header, onboarding phases).
 *
 * Each segment has its own colour (`color`, optionally a different
 * `doneColor`) and width weight. Done bars are full, the current bar fills by
 * `progress` (and is `currentFlex` times wider), upcoming bars are an empty
 * track.
 *
 * Fill modes
 *   • `separate` (default) — done bars are a solid block, the current bar a
 *     growing fill, upcoming bars render no fill element at all.
 *   • `continuous` — every bar has one fill whose width transitions
 *     (0 → p → 100 %), so finishing a bar animates it to full (onboarding).
 *
 * Direction
 *   • `rtl` (default) — first segment on the RIGHT whatever the page dir;
 *     fills grow from the right.
 *   • `inherit` — follows the surrounding `dir`; fills grow from the inline start.
 *
 * `renderOverlay` draws something above a segment (e.g. onboarding's ✓ badge).
 */

import React from 'react';
import { clampProgress, storyBarState, type StoryBarState } from './logic';

export type { StoryBarState };

export interface StoryBarSegment {
  key: string;
  /** Fill colour of the current bar (and of done bars unless `doneColor`). */
  color: string;
  /** Fill colour once the bar is done. Default `color`. */
  doneColor?: string;
  /** Width weight (flex-grow) when not current. Default 1. */
  weight?: number;
  /** Explicit state, overriding the one derived from `currentIndex`. */
  state?: StoryBarState;
}

export interface StoryBarsProps {
  segments: readonly StoryBarSegment[];
  /** Index of the current item; ≥ segments.length = all done; < 0 = none started. */
  currentIndex: number;
  /** 0–1 fill of the current bar. */
  progress: number;
  /** Width weight of the current bar vs `weight` (1) for the others. Default 3. */
  currentFlex?: number;
  /** Track (empty bar) colour. Default navy 10 %. */
  trackColor?: string;
  /** Box-shadow on fills (e.g. a glow), or none. */
  glow?: string;
  /** Minimum % width of the current fill so it reads "live" at 0. Default 1. */
  minFillPercent?: number;
  /** CSS transition of the current bar's width. Default `width 0.9s linear`. */
  fillTransition?: string;
  /** CSS transition of each segment (its flex weight). Default 320 ms on the v2 curve. */
  segmentTransition?: string;
  fillMode?: 'separate' | 'continuous';
  direction?: 'rtl' | 'inherit';
  /** Row classes (gap / alignment). Default `gap-1.5`. */
  gapClassName?: string;
  /** Track height/shape classes. Default `h-1.5 rounded-full`. */
  barClassName?: string;
  renderOverlay?: (index: number, state: StoryBarState) => React.ReactNode;
  className?: string;
}

export const STORY_TRACK_V2 = 'rgba(14,27,42,0.10)';
const SEGMENT_TRANSITION_V2 = 'flex 320ms cubic-bezier(0.23, 1, 0.32, 1)';

export default function StoryBars({
  segments,
  currentIndex,
  progress,
  currentFlex = 3,
  trackColor = STORY_TRACK_V2,
  glow,
  minFillPercent = 1,
  fillTransition = 'width 0.9s linear',
  segmentTransition = SEGMENT_TRANSITION_V2,
  fillMode = 'separate',
  direction = 'rtl',
  gapClassName = 'gap-1.5',
  barClassName = 'h-1.5 rounded-full',
  renderOverlay,
  className = '',
}: StoryBarsProps) {
  const p = clampProgress(progress);
  const rtl = direction === 'rtl';
  // Anchor fills at the reading start: physical right in rtl mode.
  const anchor: React.CSSProperties = rtl ? { right: 0 } : { insetInlineStart: 0 };
  const currentWidth = `${Math.max(minFillPercent, p * 100)}%`;

  return (
    <div
      dir={rtl ? 'ltr' : undefined}
      data-v2-story-bars
      className={`flex ${rtl ? 'flex-row-reverse' : ''} ${gapClassName} ${className}`}
      aria-hidden
    >
      {segments.map((s, i) => {
        const state = s.state ?? storyBarState(i, currentIndex);
        const fillColor = state === 'done' ? s.doneColor ?? s.color : s.color;
        const continuous = fillMode === 'continuous';
        const showFill = continuous || state !== 'upcoming';
        const width = state === 'done' ? '100%' : state === 'current' ? currentWidth : '0%';
        return (
          <div
            key={s.key}
            className="relative"
            style={{ flex: state === 'current' ? currentFlex : s.weight ?? 1, transition: segmentTransition }}
          >
            <div className={`relative overflow-hidden ${barClassName}`} style={{ background: trackColor }}>
              {showFill && (
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    ...anchor,
                    width,
                    background: fillColor,
                    boxShadow: glow,
                    transition: continuous || state === 'current' ? fillTransition : undefined,
                  }}
                />
              )}
            </div>
            {renderOverlay?.(i, state)}
          </div>
        );
      })}
    </div>
  );
}
