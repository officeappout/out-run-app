'use client';

/**
 * TimedReadyCard — before the block's clock starts: the format title with
 * its "i" (explains the FORMAT only), the segment's own title stays visible,
 * the items with their targets, and the ONE gradient CTA that starts the clock.
 */
import React from 'react';
import { Info, Play } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { Button, ExerciseThumb } from '@/components/ui/v2';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { blockTitle, readyItemLine } from '../logic/timed-labels';
import TimedCardShell from './TimedCardShell';

export interface TimedReadyCardProps {
  spec: TimedBlockSpec;
  segmentTitle: string;
  prefix: string | null;
  onInfo: () => void;
  onStart: () => void;
}

export default function TimedReadyCard({ spec, segmentTitle, prefix, onInfo, onStart }: TimedReadyCardProps) {
  const title = blockTitle(spec);
  return (
    <TimedCardShell eyebrow={prefix}>
      <div className="mb-1 flex items-center justify-center gap-2">
        <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h2>
        <button
          type="button"
          onClick={onInfo}
          aria-label="מה זה הפורמט"
          className="grid h-8 w-8 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Info size={16} strokeWidth={2.4} className="text-v2-deep" aria-hidden />
        </button>
      </div>
      {segmentTitle && segmentTitle !== title && (
        <p className="mb-2 truncate whitespace-nowrap text-center text-[13px] font-bold text-v2-muted">{segmentTitle}</p>
      )}
      <ul className="mb-3 max-h-[34vh] space-y-2 overflow-y-auto">
        {spec.items.map((item, i) => (
          <li key={`${item.key}-${i}`} className="flex items-center gap-2.5 rounded-2xl bg-white px-2.5 py-2 shadow-v2-ring">
            <div className="overflow-hidden rounded-[10px]">
              <ExerciseThumb imageUrl={item.imageUrl} size={40} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate whitespace-nowrap text-[14.5px] font-extrabold text-v2-ink">{item.name}</div>
              <div className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{readyItemLine(spec, i)}</div>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="cta" size="lg" block onClick={() => { hapticTap('impact'); onStart(); }}>
        <Play size={18} fill="currentColor" aria-hidden />
        התחלה
      </Button>
    </TimedCardShell>
  );
}
