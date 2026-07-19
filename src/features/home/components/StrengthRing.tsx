'use client';

/**
 * StrengthRing — the Daily Strength Ring (Layer A). Sets-driven fill, minutes
 * label. Pure presentational: all math comes from `getStrengthRingView`; no
 * store reads, no side effects. Consumed by the post-workout summary card now
 * and the home redesign (R) after-workout summary later — build once.
 *
 * Edge states (from the view fn): 0%, 100%, >100% (overflow badge), rest mode
 * (recovery visual, no 0/0 ring).
 *
 * NOTE: not wired anywhere yet (Block A-1). Display wiring + feature flag land
 * in Block A-2.
 */

import React from 'react';
import { Moon } from 'lucide-react';
import { getStrengthRingView } from '../utils/strengthRingView';

const BRAND_CYAN = '#00C9F2';
const TRACK = '#E2E8F0';
const REST = '#94A3B8';

export interface StrengthRingProps {
  completedSets: number;
  targetSets: number;
  /** Minutes-per-set for the derived label (see setsToMinutes). */
  avgMinutesPerSet: number;
  mode?: 'active' | 'rest';
  /** Diameter in px. */
  size?: number;
  strokeWidth?: number;
}

export default function StrengthRing({
  completedSets,
  targetSets,
  avgMinutesPerSet,
  mode,
  size = 96,
  strokeWidth = 8,
}: StrengthRingProps) {
  const view = getStrengthRingView({ completedSets, targetSets, avgMinutesPerSet, mode });

  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - view.fillPct * circumference;
  const stroke = view.isRest ? REST : BRAND_CYAN;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
      dir="rtl"
      role="img"
      aria-label={
        view.isRest
          ? 'יום מנוחה'
          : `${view.completedMinutes} מתוך ${view.targetMinutes} דקות`
      }
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={TRACK}
          strokeWidth={strokeWidth}
        />
        {!view.isRest && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        )}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {view.isRest ? (
          <>
            <Moon size={Math.round(size * 0.22)} className="text-slate-400" />
            <span className="mt-0.5 text-[11px] font-bold text-slate-500">יום מנוחה</span>
          </>
        ) : (
          <>
            <span className="text-lg font-black leading-none tabular-nums text-gray-800">
              {view.completedMinutes}
              <span className="text-[11px] font-bold text-gray-400">/{view.targetMinutes}</span>
            </span>
            <span className="text-[10px] font-semibold text-gray-400">דק׳</span>
            {view.overflow && (
              <span className="mt-0.5 text-[10px] font-bold text-[#00C9F2]">
                +{view.overflowSets} סטים
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
