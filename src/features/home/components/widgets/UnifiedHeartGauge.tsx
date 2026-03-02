'use client';

/**
 * UnifiedHeartGauge — "Health Pension" ring.
 *
 * Implements WHO-weighted minutes:
 *   Strength (vigorous)    → 1 min = 2 WHO points
 *   Cardio   (moderate)    → 1 min = 1 WHO point
 *   Maintenance (moderate) → 1 min = 1 WHO point
 *
 * The gauge fills as a single holistic arc towards a configurable
 * weekly target (default 150 WHO-points).  It closes at 100% when
 * the total weighted points reach the target — even if an individual
 * category sits at 0%.  This represents the "Health Savings" model
 * where any movement counts.
 *
 * Color blending:
 *   Cyan   (#06B6D4) → Strength
 *   Lime   (#84CC16) → Cardio
 *   Purple (#A855F7) → Maintenance
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ACTIVITY_COLORS,
  WHO_COMPLIANCE_BASELINE,
  type ActivityCategory,
} from '@/features/activity/types/activity.types';

// WHO intensity multipliers
const WHO_WEIGHT: Record<ActivityCategory, number> = {
  strength: 2,     // vigorous: 1 min = 2 moderate-equivalent
  cardio: 1,       // moderate baseline
  maintenance: 1,  // moderate baseline
};

interface UnifiedHeartGaugeProps {
  /** Raw minutes per category this week */
  categoryMinutes: Record<ActivityCategory, number>;
  /** Weekly WHO target in moderate-equivalent points (default 150) */
  weeklyTarget?: number;
  /** Diameter in px */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Show center text */
  showCenter?: boolean;
  className?: string;
}

const CATEGORIES: ActivityCategory[] = ['strength', 'cardio', 'maintenance'];

export default function UnifiedHeartGauge({
  categoryMinutes,
  weeklyTarget = WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes,
  size = 56,
  strokeWidth = 5,
  showCenter = true,
  className = '',
}: UnifiedHeartGaugeProps) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // WHO weighted points and holistic percent
  const { totalWeightedPoints, totalPercent, segments } = useMemo(() => {
    let points = 0;
    const segs: Array<{ cat: ActivityCategory; color: string; weighted: number }> = [];

    for (const cat of CATEGORIES) {
      const raw = categoryMinutes[cat] ?? 0;
      const w = raw * WHO_WEIGHT[cat];
      points += w;
      segs.push({ cat, color: ACTIVITY_COLORS[cat].hex, weighted: w });
    }

    // Holistic: 100% when total points reach target, regardless of per-category spread
    const pct = Math.min(Math.round((points / weeklyTarget) * 100), 100);
    return { totalWeightedPoints: Math.round(points), totalPercent: pct, segments: segs };
  }, [categoryMinutes, weeklyTarget]);

  // Conic gradient proportional to each category's weighted contribution
  const conicGradient = useMemo(() => {
    const totalW = segments.reduce((s, seg) => s + seg.weighted, 0);
    if (totalW === 0) {
      return `conic-gradient(${ACTIVITY_COLORS.strength.hex} 0deg 120deg, ${ACTIVITY_COLORS.cardio.hex} 120deg 240deg, ${ACTIVITY_COLORS.maintenance.hex} 240deg 360deg)`;
    }
    let angle = 0;
    const stops: string[] = [];
    for (const seg of segments) {
      const span = (seg.weighted / totalW) * 360;
      stops.push(`${seg.color} ${angle}deg ${angle + span}deg`);
      angle += span;
    }
    return `conic-gradient(from -90deg, ${stops.join(', ')})`;
  }, [segments]);

  const progressArc = circumference - (circumference * totalPercent) / 100;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Track — conic gradient at low opacity */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: conicGradient,
          mask: `radial-gradient(farthest-side, transparent ${100 - (strokeWidth / size) * 200}%, #000 ${100 - (strokeWidth / size) * 200}% 100%, transparent 100%)`,
          WebkitMask: `radial-gradient(farthest-side, transparent ${100 - (strokeWidth / size) * 200}%, #000 ${100 - (strokeWidth / size) * 200}% 100%, transparent 100%)`,
          opacity: 0.15,
        }}
      />

      {/* Fill arc */}
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id="unified-heart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={ACTIVITY_COLORS.strength.hex} />
            <stop offset="40%" stopColor={ACTIVITY_COLORS.cardio.hex} />
            <stop offset="100%" stopColor={ACTIVITY_COLORS.maintenance.hex} />
          </linearGradient>
        </defs>
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#unified-heart-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: progressArc }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${center}px ${center}px` }}
        />
      </svg>

      {/* Center text — shows WHO points/target or percentage */}
      {showCenter && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black text-gray-700 dark:text-gray-200 tabular-nums">
            {totalPercent}%
          </span>
        </div>
      )}
    </div>
  );
}
