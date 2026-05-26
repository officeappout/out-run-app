'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * StatBox — single metric tile used in the summary's top stats row.
 *
 * Layout: label (small, top) → centered value + adjacent icon (colored).
 * Optional `hasBorder` paints the middle "duration" pillar's vertical dividers.
 * Optional `showTrend` swaps the icon for a generic TrendingUp arrow.
 *
 * Pure presentational — no state, no derived values.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-1).
 */

export interface StatBoxProps {
  /** Small uppercase-like label above the value (e.g. "קלוריות"). */
  label: string;
  /** Primary metric value — usually a number or formatted MM:SS string. */
  value: string | number;
  /** Right-side icon (lucide element) — replaced by TrendingUp when `showTrend` is true. */
  icon: React.ReactNode;
  /** Tailwind text color class applied to the value + icon row. */
  iconColor?: string;
  /** When true, swap `icon` for a generic TrendingUp arrow (legacy KPI mode). */
  showTrend?: boolean;
  /** When true, paint left/right dividers around the tile (middle-pillar treatment). */
  hasBorder?: boolean;
}

export default function StatBox({
  label,
  value,
  icon,
  iconColor = 'text-primary',
  showTrend = false,
  hasBorder = false,
}: StatBoxProps) {
  return (
    <div className={`flex flex-col ${hasBorder ? 'border-x border-slate-100 dark:border-slate-700 px-6' : ''}`}>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <div className={`flex items-center justify-center gap-1 ${iconColor}`}>
        <span className="text-lg font-bold">{value}</span>
        {showTrend && <TrendingUp className="w-4 h-4" />}
        {!showTrend && icon}
      </div>
    </div>
  );
}
