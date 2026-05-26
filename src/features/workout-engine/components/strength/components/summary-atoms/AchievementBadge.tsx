'use client';

import React from 'react';

/**
 * AchievementBadge — circular weekly-achievement tile.
 *
 * Renders a 48×48 circle with:
 *   • A faint base ring (20% primary)
 *   • A solid primary arc whose terminal angle = `progress` degrees (0–360)
 *   • A centered icon glyph
 *   • A "current/total" counter and a small wrapping label below
 *
 * The arc is implemented by rotating a `border-t-transparent` ring — so 90° of
 * progress shows a quarter of the ring filled (starting at 12 o'clock).
 *
 * Pure presentational — no state, no derived values.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-1).
 */

export interface AchievementBadgeProps {
  /** Center glyph (lucide icon, etc.). */
  icon: React.ReactNode;
  /** Numerator displayed below the badge. */
  current: number;
  /** Denominator displayed below the badge. */
  total: number;
  /** Short label (e.g. "מטבעות", "אימוני כוח"). */
  label: string;
  /** Progress in degrees, 0–360 (will be clamped). */
  progress: number;
}

export default function AchievementBadge({
  icon,
  current,
  total,
  label,
  progress,
}: AchievementBadgeProps) {
  const rotation = Math.min(progress, 360) - 90; // Start arc from top (12 o'clock)

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-12 h-12 mb-2">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div
          className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-500">{current}/{total}</span>
      <span className="text-[9px] text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}
