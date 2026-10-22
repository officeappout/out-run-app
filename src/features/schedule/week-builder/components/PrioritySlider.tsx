'use client';

/**
 * "יותר כוח ↔ יותר ריצה" (boards S-2c / S-2f / S-2g) — two tracks only. The engine resolves
 * conflicts by a priority (strength first / balanced / run first), so the slider has exactly
 * those three stops; the line in the middle is what the engine's week holds ("3 כוח · 3 ריצה").
 */
import { useT } from '@/hooks/useT';
import { hapticTap } from '@/lib/haptics';
import { schedule } from '@/messages/ns/schedule';
import type { SchedulePriority } from '../../engine-v2/types';

const STOPS: readonly SchedulePriority[] = ['strength_first', 'balanced', 'run_first'];

export const priorityStop = (p: SchedulePriority): number => Math.max(0, STOPS.indexOf(p === 'skill' ? 'balanced' : p));

export interface PrioritySliderProps {
  value: SchedulePriority;
  onChange: (p: SchedulePriority) => void;
  strengthCount: number;
  runCount: number;
}

export default function PrioritySlider({ value, onChange, strengthCount, runCount }: PrioritySliderProps) {
  const t = useT(schedule);
  return (
    <div className="mt-3.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px] font-extrabold">
        <span className="whitespace-nowrap text-v2-muted">{t('weekBuilder.ratio.moreStrength')}</span>
        <span className="whitespace-nowrap tabular-nums text-v2-deep">
          {t('weekBuilder.ratio.line', { strength: String(strengthCount), run: String(runCount) })}
        </span>
        <span className="whitespace-nowrap text-v2-muted">{t('weekBuilder.ratio.moreRun')}</span>
      </div>
      <input
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={priorityStop(value)}
        onChange={(e) => { const next = STOPS[Number(e.target.value)] ?? 'balanced'; if (next !== value) hapticTap('selection'); onChange(next); }}
        aria-label={t('weekBuilder.ratio.aria')}
        aria-valuetext={t('weekBuilder.ratio.line', { strength: String(strengthCount), run: String(runCount) })}
        className="h-8 w-full cursor-pointer accent-v2-accent"
        dir="rtl"
      />
    </div>
  );
}
