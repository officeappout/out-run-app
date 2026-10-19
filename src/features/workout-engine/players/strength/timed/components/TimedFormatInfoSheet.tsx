'use client';

/**
 * TimedFormatInfoSheet — behind the "i" (board A-2a2): what the FORMAT is
 * and how it is counted. Nothing about this particular workout.
 */
import React from 'react';
import { Sheet, SHEET_Z } from '@/components/ui/v2';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { formatInfo } from '../logic/timed-labels';

export default function TimedFormatInfoSheet({ spec, open, onClose }: { spec: TimedBlockSpec; open: boolean; onClose: () => void }) {
  const info = formatInfo(spec);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={info.title}
      ariaLabel={info.title}
      // Over the preview drawer / the player's own z-[100] layers.
      zIndex={SHEET_Z.aboveOffline}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full whitespace-nowrap rounded-full bg-white text-[16px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          הבנתי
        </button>
      }
    >
      <ul className="space-y-2.5 pb-2">
        {info.lines.map((line) => (
          <li key={line} className="flex gap-2 text-[15px] font-bold leading-6 text-v2-ink-2">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-v2-accent" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
