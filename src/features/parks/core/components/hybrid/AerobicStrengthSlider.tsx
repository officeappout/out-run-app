'use client';

/**
 * AerobicStrengthSlider — additive continuous aerobic↔strength ratio control
 * for FreeRunDrawer (design §4.2 / U2). A single slider (30–70% aerobic) with a
 * live split read, a "מומלץ" marker at the balanced anchor, and shifting helper
 * text keyed to the goal. Presentational — value + text math come from
 * build-hybrid-input (single source of truth).
 */

import {
  splitHelperText,
  AEROBIC_SHARE_MIN,
  AEROBIC_SHARE_MAX,
  RECOMMENDED_AEROBIC_SHARE,
  type HybridGoalType,
} from '@/features/workout-engine/hybrid/build-hybrid-input';

interface AerobicStrengthSliderProps {
  aerobicShare: number;
  onChange: (next: number) => void;
  goalType: HybridGoalType;
  timeBudgetMin: number;
  /** Resolved station count (MVP sandwich = 1). */
  stations?: number;
  accent?: string;
}

export default function AerobicStrengthSlider({
  aerobicShare,
  onChange,
  goalType,
  timeBudgetMin,
  stations = 1,
  accent = '#00ADEF',
}: AerobicStrengthSliderProps) {
  const pctAerobic = Math.round(aerobicShare * 100);
  const pctStrength = 100 - pctAerobic;
  const isRecommended = Math.abs(aerobicShare - RECOMMENDED_AEROBIC_SHARE) < 0.03;

  return (
    <div className="px-5 mb-3" dir="rtl">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-black text-gray-700">אירובי {pctAerobic}%</span>
        {isRecommended && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ color: accent, backgroundColor: `${accent}14` }}>
            מומלץ
          </span>
        )}
        <span className="text-[12px] font-black text-gray-700">כוח {pctStrength}%</span>
      </div>

      <input
        type="range"
        min={Math.round(AEROBIC_SHARE_MIN * 100)}
        max={Math.round(AEROBIC_SHARE_MAX * 100)}
        step={1}
        value={pctAerobic}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
        style={{ accentColor: accent }}
        aria-label="יחס אירובי לעומת כוח"
      />

      <p className="mt-1.5 text-[11px] leading-snug text-gray-500 font-semibold">
        {splitHelperText(goalType, timeBudgetMin, aerobicShare, stations)}
      </p>
    </div>
  );
}
