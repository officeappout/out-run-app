"use client";

/**
 * StrengthVolumeWidget — "התקדמות שבועית"
 *
 * Two layout modes:
 *   "full"    — full-width card with title, used for HYBRID (strength + running rows).
 *   "compact" — half-width card without title, strength-only, for side-by-side layout.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWeeklyProgress } from '@/features/activity';
import { useUserStore } from '@/features/user';
import { getProgramIcon } from '@/features/content/programs';

// ============================================================================
// TYPES
// ============================================================================

interface TrackRow {
  id: string;
  label: string;
  iconKey?: string;
  completed: number;
  target: number;
}

interface StrengthVolumeWidgetProps {
  rows?: TrackRow[];
  /** "full" = full-width with title (default). "compact" = half-width, no title. */
  layout?: 'full' | 'compact';
  className?: string;
}

// ============================================================================
// SEGMENTED BAR
// ============================================================================

function SegmentedBar({
  segments,
  completed,
}: {
  segments: number;
  completed: number;
}) {
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
              isFilled
                ? 'bg-[#00C9F2]'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// CARD SHELL — shared border/shadow/padding
// ============================================================================

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  padding: 16,
  border: '0.5px solid #E0E9FF',
  boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StrengthVolumeWidget({
  rows: customRows,
  layout = 'full',
  className = '',
}: StrengthVolumeWidgetProps) {
  const { profile } = useUserStore();
  const { summary } = useWeeklyProgress();

  const rows = useMemo((): TrackRow[] => {
    if (customRows) return customRows;

    const strengthSessions = summary?.categorySessions?.strength ?? 0;
    const cardioSessions = summary?.categorySessions?.cardio ?? 0;
    const cardioMinutes = summary?.categoryTotals?.cardio ?? 0;

    const result: TrackRow[] = [
      {
        id: 'strength',
        label: 'אימוני כוח',
        iconKey: 'muscle',
        completed: strengthSessions,
        target: 3,
      },
    ];

    const primaryTrack = profile?.lifestyle?.primaryTrack;
    if (
      layout === 'full' &&
      (cardioMinutes > 0 || cardioSessions > 0 || primaryTrack === 'run' || primaryTrack === 'hybrid')
    ) {
      result.push({
        id: 'cardio',
        label: 'אימוני ריצה',
        iconKey: 'shoe',
        completed: cardioSessions,
        target: 2,
      });
    }

    return result;
  }, [customRows, summary, profile, layout]);

  if (rows.length === 0) return null;

  // ── Compact mode: no title, no max-width (parent controls width) ──
  if (layout === 'compact') {
    const row = rows[0];
    return (
      <div
        className={`bg-white dark:bg-slate-800 overflow-hidden ${className}`}
        style={{ ...CARD_STYLE, width: 231, minWidth: 0, flexShrink: 1 }}
        dir="rtl"
      >
        <SegmentedBar segments={row.target} completed={row.completed} />

        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-700 dark:text-gray-300">
              {getProgramIcon(row.iconKey, 'w-4 h-4')}
            </span>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
              {row.label}
            </span>
          </div>
          <span className="text-[14px] font-bold text-gray-500 dark:text-gray-400 tabular-nums">
            {row.completed}/{row.target}
          </span>
        </div>
      </div>
    );
  }

  // ── Full mode: title + full-width card ──
  return (
    <div className={`w-full max-w-[358px] mx-auto ${className}`} dir="rtl">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 px-1">
        התקדמות שבועית
      </h3>

      <div className="bg-white dark:bg-slate-800 overflow-hidden" style={CARD_STYLE}>
        <div className={rows.length > 1 ? 'space-y-5' : ''}>
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <SegmentedBar segments={row.target} completed={row.completed} />

              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 dark:text-gray-300">
                    {getProgramIcon(row.iconKey, 'w-5 h-5')}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {row.label}
                  </span>
                </div>
                <span className="text-[14px] font-bold text-gray-500 dark:text-gray-400 tabular-nums">
                  {row.completed}/{row.target}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { CARD_STYLE as WIDGET_CARD_STYLE };
export default StrengthVolumeWidget;
