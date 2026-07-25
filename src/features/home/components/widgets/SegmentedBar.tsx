"use client";

/**
 * SegmentedBar — story-style horizontal session counter.
 *
 * Extracted from `StrengthVolumeWidget` (lines 41–79 in the original file)
 * so the same primitive can be reused by `ConsistencyWidget` and any future
 * "X / Y sessions" surface without copying the animation logic.
 *
 * Each segment is a flex-1 pill that animates in (filled segments use a
 * spring transition with a stagger; empty segments fade in shorter).
 */

import React from 'react';
import { motion } from 'framer-motion';

interface SegmentedBarProps {
  /** Total target segments (denominator of "X / Y") */
  segments: number;
  /** How many segments to render as filled */
  completed: number;
  /** Tailwind color class for filled segments (default: cyan brand) */
  filledClassName?: string;
  /** Tailwind color class for empty segments */
  trackClassName?: string;
  /**
   * HOME_DAILY_GOAL_V1 (item 2): per-segment partial fill + state. When provided,
   * each segment fills to `pct` (0..1) and is coloured blue when `met` (counted,
   * ≥⅔ of the daily target) or orange when still in-progress. Overrides the binary
   * `completed` reading. Absent → legacy byte-identical binary segments.
   */
  segmentStates?: Array<{ pct: number; met: boolean }>;
}

export function SegmentedBar({
  segments,
  completed,
  filledClassName = 'bg-[#00C9F2]',
  trackClassName = 'bg-gray-200 dark:bg-gray-700',
  segmentStates,
}: SegmentedBarProps) {
  const total = segmentStates ? Math.max(segmentStates.length, 1) : Math.max(segments, 1);

  return (
    <div className="flex gap-1.5 w-full">
      {Array.from({ length: total }, (_, i) => {
        // HOME_DAILY_GOAL_V1: partial-fill + orange(in-progress)/blue(counted).
        const state = segmentStates?.[i];
        if (state) {
          const pct = Math.round(Math.max(0, Math.min(1, state.pct)) * 100);
          return (
            <div key={i} className={`h-2 rounded-full flex-1 overflow-hidden ${trackClassName}`}>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.12 }}
                style={{ width: `${pct}%` }}
                className={`h-full rounded-full origin-left ${state.met ? 'bg-[#00C9F2]' : 'bg-orange-400'}`}
              />
            </div>
          );
        }
        const isFilled = i < completed;
        return (
          <motion.div
            key={i}
            initial={{ scaleX: 0, opacity: 0.4 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={
              isFilled
                ? {
                    type: 'spring',
                    stiffness: 120,
                    damping: 18,
                    delay: i * 0.15,
                  }
                : { duration: 0.3, delay: i * 0.05 }
            }
            className={`h-2 rounded-full flex-1 origin-left ${
              isFilled ? filledClassName : trackClassName
            }`}
          />
        );
      })}
    </div>
  );
}

export default SegmentedBar;
