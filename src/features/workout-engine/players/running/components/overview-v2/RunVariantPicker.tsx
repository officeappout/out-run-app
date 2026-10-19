'use client';

/**
 * Level selector of the run overview (boards M-6a / M-7d): קליל · מאוזן ·
 * עוצמתי, each with its bolts and its time ("קליל · 34׳"). A level is the
 * plan's main-set STRUCTURE (4 / 6 / 8 reps, 2′ / 90″ / 60″ recovery, or the
 * steady time) — the paces stay the runner's own. The shared
 * SegmentedPicker — selected = brand tint.
 *
 * `manual` (board M-7c): the main set was swapped by hand — no level is
 * selected and a note says picking one returns to the plan's structure.
 */

import { SegmentedPicker } from '@/components/ui/v2';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import { estimateRunTotals, type RunPaceContext } from '../../utils/run-preview/run-estimates';
import type { RunVariant, RunVariantKey } from '../../utils/run-overview/run-variants';

export const LEVEL_NAMES: Record<RunVariantKey, string> = { lighter: 'קליל', planned: 'מאוזן', harder: 'עוצמתי' };
export const MANUAL_NOTE = 'העיקר הוחלף ידנית — בחירה ברמה תחזיר מבנה מהתוכנית';

export interface RunVariantPickerProps {
  variants: readonly RunVariant[];
  value: RunVariantKey;
  onChange: (key: RunVariantKey) => void;
  ctx: RunPaceContext;
  /** The main set was swapped by hand (M-7c). */
  manual?: boolean;
  className?: string;
}

/** "קליל · 34׳" (the level's whole-workout minutes). */
export function variantOptionLabel(v: RunVariant, ctx: RunPaceContext): string {
  const sec = estimateRunTotals(v.blocks, ctx).seconds;
  return sec ? `${LEVEL_NAMES[v.key]} · ${Math.max(1, Math.round(sec / 60))}׳` : LEVEL_NAMES[v.key];
}

export default function RunVariantPicker({ variants, value, onChange, ctx, manual = false, className }: RunVariantPickerProps) {
  return (
    <div className={className}>
      <SegmentedPicker<RunVariantKey | 'manual'>
        ariaLabel="בחירת עומס"
        value={manual ? 'manual' : value}
        onChange={(k) => { if (k !== 'manual') onChange(k); }}
        options={variants.map((v) => ({
          key: v.key,
          label: variantOptionLabel(v, ctx),
          icon: <DifficultyBolts difficulty={v.level} size="sm" showLabel={false} />,
        }))}
      />
      {manual && <p className="mt-1.5 truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{MANUAL_NOTE}</p>}
    </div>
  );
}
