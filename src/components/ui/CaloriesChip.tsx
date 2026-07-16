'use client';

/**
 * CaloriesChip — the shared calorie-display primitive (central control for the
 * ~16 scattered calorie surfaces the audit found). Presentational ONLY: it takes
 * an already-computed `calories` number and never runs any of the calorie
 * formulas. Uniform look: "קלוריות" label · Flame icon · one orange (orange-500).
 *
 * Tier 2 nudge: when `weightDependent` is set and the user has no weight on file,
 * it shows an inline "לחצו לדיוק" affordance that fires `onEditWeight` — the
 * consumer opens the shared WeightInlineRow (no new weight UI).
 *
 * Currently only the 'chip' variant is implemented; the `variant` API is shaped
 * so 'stat' | 'ring' | 'inline' can be added in a later batch without changing
 * call sites. Adopted only in the hybrid drawer for now — rollout is separate.
 */

import { Flame } from 'lucide-react';
import { useWeightNudge } from './WeightInlineRow';

export type CaloriesChipVariant = 'chip' | 'stat' | 'ring' | 'inline';

interface CaloriesChipProps {
  /** Already-computed calories — this component never computes. */
  calories: number;
  /** Source formula depends on user weight → enable the accuracy nudge. */
  weightDependent?: boolean;
  /** Visual variant. Only 'chip' is implemented today. */
  variant?: CaloriesChipVariant;
  /** Fired when the user taps "לחצו לדיוק" (shown only when weight is unset). */
  onEditWeight?: () => void;
}

export default function CaloriesChip({
  calories,
  weightDependent = false,
  variant = 'chip',
  onEditWeight,
}: CaloriesChipProps) {
  const { needsWeight } = useWeightNudge();
  const showNudge = weightDependent && needsWeight && !!onEditWeight;

  // Only 'chip' is wired today; stat/ring/inline branch here in a later batch.
  return (
    <span
      data-variant={variant}
      className="inline-flex items-center gap-1.5 bg-white rounded-lg text-[12.5px] font-bold"
      style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '6px 11px', color: '#374151' }}
    >
      <Flame size={15} className="text-orange-500" />
      {Math.round(calories)} קלוריות
      {showNudge && (
        <>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <button
            type="button"
            onClick={onEditWeight}
            className="text-orange-500 font-bold underline decoration-dotted underline-offset-2 active:opacity-70"
            style={{ fontSize: '11.5px' }}
          >
            לחצו לדיוק
          </button>
        </>
      )}
    </span>
  );
}
