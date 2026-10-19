'use client';

/**
 * TimedDoneCard — the short "block done" moment before the workout moves on
 * (next segment, or the summary). No CTA: it advances by itself.
 */
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import { resultLine } from '../logic/timed-labels';
import TimedCardShell from './TimedCardShell';

export default function TimedDoneCard({ title, result }: { title: string; result: TimedBlockResult | null }) {
  return (
    <TimedCardShell>
      <div className="flex flex-col items-center gap-1 pb-2 pt-1">
        <CheckCircle2 size={36} strokeWidth={2.2} className="text-v2-accent" aria-hidden />
        <p className="whitespace-nowrap text-[20px] font-black !tracking-[-0.02em] text-v2-ink">{title} הושלם</p>
        {result && <p className="whitespace-nowrap text-[14px] font-extrabold tabular-nums text-v2-deep">{resultLine(result)}</p>}
      </div>
    </TimedCardShell>
  );
}
