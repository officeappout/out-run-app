'use client';

/**
 * Variant selector of the run overview (board M-6a): lighter · as planned ·
 * harder, each with its bolts and size ("4 × 400 · 34׳" / "30 דק׳"). The
 * shared SegmentedPicker — selected = brand tint.
 */

import { SegmentedPicker } from '@/components/ui/v2';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import { estimateRunTotals, type RunPaceContext } from '../../utils/run-preview/run-estimates';
import type { RunVariant, RunVariantKey } from '../../utils/run-overview/run-variants';

export interface RunVariantPickerProps {
  variants: readonly RunVariant[];
  value: RunVariantKey;
  onChange: (key: RunVariantKey) => void;
  ctx: RunPaceContext;
  className?: string;
}

export function variantOptionLabel(v: RunVariant, ctx: RunPaceContext): string {
  if (/דק׳$/u.test(v.label)) return v.label;
  const sec = estimateRunTotals(v.blocks, ctx).seconds;
  return sec ? `${v.label} · ${Math.max(1, Math.round(sec / 60))}׳` : v.label;
}

export default function RunVariantPicker({ variants, value, onChange, ctx, className }: RunVariantPickerProps) {
  return (
    <SegmentedPicker
      className={className}
      ariaLabel="בחירת עומס"
      value={value}
      onChange={onChange}
      options={variants.map((v) => ({
        key: v.key,
        label: variantOptionLabel(v, ctx),
        icon: <DifficultyBolts difficulty={v.level} size="sm" showLabel={false} />,
      }))}
    />
  );
}
