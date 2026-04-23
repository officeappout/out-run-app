"use client";

/**
 * CompactMetricTile — small horizontal tile for half-width side-by-side rows.
 *
 * Visual language matches the existing "ExerciseRow" / strength tile in
 * `StatsOverview.tsx` (small icon + name + tabular value), shrunk to fit a
 * `SideBySideRow` cell. Used by `HealthMetricsRow` and
 * `PerformanceMetricsRow` so both rows feel like a single product.
 *
 * Reuses the project `CircularProgress` (same component as Strength
 * Programs and `StepsSummaryCard`) for the optional ring.
 */

import React from 'react';
import CircularProgress from '@/components/CircularProgress';

export interface CompactMetricTileProps {
  /** Optional ring percentage (0–100). Hidden if undefined. */
  percentage?: number;
  /** Icon shown inside the ring (or floating left if no ring). */
  icon: React.ReactNode;
  /** Hebrew label (e.g. "פעילות שבועית"). */
  label: string;
  /** Primary value (e.g. "120", "6,500"). Rendered LTR for digits. */
  value: string;
  /** Optional unit/target (e.g. "/ 150 דק׳", "/ 10,000 צעדים"). */
  unit?: string;
  /** Click handler — entire tile becomes a button. */
  onClick?: () => void;
  /** Aria label for the tile button. */
  ariaLabel?: string;
  className?: string;
}

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '0.5px solid #E0E9FF',
  boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
};

export function CompactMetricTile({
  percentage,
  icon,
  label,
  value,
  unit,
  onClick,
  ariaLabel,
  className = '',
}: CompactMetricTileProps) {
  const inner = (
    <div className="flex items-center gap-2.5 w-full" dir="rtl">
      <div className="shrink-0">
        {percentage !== undefined ? (
          <CircularProgress percentage={percentage} size={42} strokeWidth={4}>
            <span className="text-primary">{icon}</span>
          </CircularProgress>
        ) : (
          <div className="w-[42px] h-[42px] rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col leading-tight text-start">
        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 truncate">
          {label}
        </span>
        <span
          className="text-[16px] font-black text-gray-900 dark:text-white tabular-nums leading-none mt-0.5"
          dir="ltr"
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 truncate mt-0.5">
            {unit}
          </span>
        )}
      </div>
    </div>
  );

  const baseClass = `bg-white dark:bg-[#1E1E1E] w-full h-full p-3 active:scale-[0.99] transition-transform ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={baseClass}
        style={CARD_STYLE}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={baseClass} style={CARD_STYLE}>
      {inner}
    </div>
  );
}

export default CompactMetricTile;
