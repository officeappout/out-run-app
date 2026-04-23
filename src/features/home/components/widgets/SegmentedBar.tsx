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
}

export function SegmentedBar({
  segments,
  completed,
  filledClassName = 'bg-[#00C9F2]',
  trackClassName = 'bg-gray-200 dark:bg-gray-700',
}: SegmentedBarProps) {
  const total = Math.max(segments, 1);

  return (
    <div className="flex gap-1.5 w-full">
      {Array.from({ length: total }, (_, i) => {
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
