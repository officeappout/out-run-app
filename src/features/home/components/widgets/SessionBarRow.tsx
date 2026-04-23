"use client";

/**
 * SessionBarRow — single "story bar + icon + label + count" row.
 *
 * Extracted from `StrengthVolumeWidget` to be reused by `ConsistencyWidget`
 * (Row 2 left of the dashboard) and any future widget that needs the same
 * adherence row chrome. Single source of truth — keep this in sync with
 * the visual style used inside `StrengthVolumeWidget`.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { SegmentedBar } from './SegmentedBar';
import { getProgramIcon } from '@/features/content/programs';

export interface SessionBarRowProps {
  /** Segment count (target sessions). */
  target: number;
  /** Segments filled (completed sessions). */
  done: number;
  /** Hebrew label, e.g. "אימוני כוח". */
  label: string;
  /** Optional icon key for `getProgramIcon`. Falls back to a custom icon. */
  iconKey?: string;
  /** Optional explicit React icon (overrides `iconKey`). */
  icon?: React.ReactNode;
  /** Tailwind class for filled segments. Defaults to brand cyan. */
  filledClassName?: string;
  /** Animate-in delay multiplier (used by parent for stagger). */
  index?: number;
  /** Compact = smaller text and icons (for half-width side-by-side). */
  compact?: boolean;
}

export function SessionBarRow({
  target,
  done,
  label,
  iconKey,
  icon,
  filledClassName,
  index = 0,
  compact = false,
}: SessionBarRowProps) {
  const iconNode = icon ?? (iconKey ? getProgramIcon(iconKey, compact ? 'w-4 h-4' : 'w-5 h-5') : null);
  const labelClass = compact
    ? 'text-xs font-semibold text-gray-800 dark:text-gray-100 truncate'
    : 'text-sm font-semibold text-gray-800 dark:text-gray-100';
  const countClass = compact
    ? 'text-[12px] font-bold text-gray-500 dark:text-gray-400 tabular-nums'
    : 'text-[14px] font-bold text-gray-500 dark:text-gray-400 tabular-nums';

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <SegmentedBar
        segments={target}
        completed={Math.min(done, target)}
        filledClassName={filledClassName}
      />

      <div className={`flex items-center justify-between ${compact ? 'mt-2' : 'mt-2.5'}`}>
        <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
          <span className="text-gray-700 dark:text-gray-300">{iconNode}</span>
          <span className={labelClass}>{label}</span>
        </div>
        <span className={countClass}>
          {done}/{target}
        </span>
      </div>
    </motion.div>
  );
}

export default SessionBarRow;
