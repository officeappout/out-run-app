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
  /** Home v2 (enable_home_v2) styling. Default false = today's UI. */
  v2?: boolean;
  /** Replaces the workout-split helper line (the schedule's priority uses its own words). */
  helperText?: string;
  /** Where the "מומלץ" badge sits. Default: the balanced hybrid anchor. */
  recommendedShare?: number;
}

export default function AerobicStrengthSlider({
  aerobicShare,
  onChange,
  goalType,
  timeBudgetMin,
  stations = 1,
  accent = '#00ADEF',
  v2 = false,
  helperText,
  recommendedShare = RECOMMENDED_AEROBIC_SHARE,
}: AerobicStrengthSliderProps) {
  const pctAerobic = Math.round(aerobicShare * 100);
  const pctStrength = 100 - pctAerobic;
  const isRecommended = Math.abs(aerobicShare - recommendedShare) < 0.03;
  const helper = helperText ?? splitHelperText(goalType, timeBudgetMin, aerobicShare, stations);

  if (v2) {
    return (
      <div className="px-5 mb-4" dir="rtl">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="whitespace-nowrap text-[13px] font-extrabold tabular-nums text-v2-ink">אירובי {pctAerobic}%</span>
          {isRecommended && (
            <span className="whitespace-nowrap rounded-full bg-v2-tint px-2.5 py-0.5 text-[12px] font-extrabold text-v2-deep">
              מומלץ
            </span>
          )}
          <span className="whitespace-nowrap text-[13px] font-extrabold tabular-nums text-v2-ink">כוח {pctStrength}%</span>
        </div>
        <input
          type="range"
          min={Math.round(AEROBIC_SHARE_MIN * 100)}
          max={Math.round(AEROBIC_SHARE_MAX * 100)}
          step={1}
          value={pctAerobic}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-full"
          style={{ accentColor: '#00baf7' }}
          aria-label="יחס אירובי לעומת כוח"
        />
        <p className="mt-1.5 text-[12.5px] font-bold leading-snug text-v2-muted">
          {helper}
        </p>
      </div>
    );
  }

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
        {helper}
      </p>
    </div>
  );
}
