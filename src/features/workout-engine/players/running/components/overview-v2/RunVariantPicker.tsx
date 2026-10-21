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
import { useT, type ReactTFunction } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';

export const LEVEL_NAME_KEYS = {
  lighter: 'run.overview.level.lighter',
  planned: 'run.overview.level.planned',
  harder: 'run.overview.level.harder',
} as const satisfies Record<RunVariantKey, PlayerKey>;

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
export function variantOptionLabel(v: RunVariant, ctx: RunPaceContext, t: ReactTFunction<PlayerKey>): string {
  const sec = estimateRunTotals(v.blocks, ctx).seconds;
  const name = t(LEVEL_NAME_KEYS[v.key]);
  return sec ? t('run.overview.level.withMinutes', { name, min: String(Math.max(1, Math.round(sec / 60))) }) : name;
}

export default function RunVariantPicker({ variants, value, onChange, ctx, manual = false, className }: RunVariantPickerProps) {
  const t = useT(player);
  return (
    <div className={className}>
      <SegmentedPicker<RunVariantKey | 'manual'>
        ariaLabel={t('run.overview.level.aria')}
        value={manual ? 'manual' : value}
        onChange={(k) => { if (k !== 'manual') onChange(k); }}
        options={variants.map((v) => ({
          key: v.key,
          label: variantOptionLabel(v, ctx, t),
          icon: <DifficultyBolts difficulty={v.level} size="sm" showLabel={false} />,
        }))}
      />
      {manual && <p className="mt-1.5 truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{t('run.overview.level.manualNote')}</p>}
    </div>
  );
}
