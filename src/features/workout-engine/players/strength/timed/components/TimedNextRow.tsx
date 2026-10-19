'use client';

/**
 * TimedNextRow — "הבא בסבב / דקה 6 / התרגיל הבא" row under the CTA:
 * thumbnail, caption, name · target.
 */
import React from 'react';
import { Footprints } from 'lucide-react';
import { ExerciseThumb } from '@/components/ui/v2';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import { itemTargetText } from '../logic/timed-labels';

export default function TimedNextRow({ caption, item }: { caption: string; item: TimedItem | null }) {
  if (!item) return null;
  const target = item.kind === 'exercise' ? itemTargetText(item) : '';
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-v2-surface px-2.5 py-2 ring-1 ring-inset ring-v2-hairline">
      <div className="overflow-hidden rounded-[10px]">
        {item.kind === 'aerobic_leg' ? (
          <div className="grid h-10 w-10 place-items-center bg-[#ecfccb] text-[#65a30d]">
            <Footprints size={18} strokeWidth={2.2} aria-hidden />
          </div>
        ) : (
          <ExerciseThumb imageUrl={item.imageUrl} size={40} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="whitespace-nowrap text-[11.5px] font-extrabold text-v2-deep">{caption}</div>
        <div className="truncate whitespace-nowrap text-[14px] font-extrabold text-v2-ink">
          {item.name}
          {target && <span className="font-bold text-v2-muted"> · {target}</span>}
        </div>
      </div>
    </div>
  );
}
