'use client';

/**
 * TimedClockCard — a phase that ends on the clock, no tap needed:
 *   tabata work (board A-1b): "טבטה" + the interval clock "0:12 / 0:20" + the name;
 *   rest (A-1c tabata rest, A-4c the rest of an EMOM minute): "מנוחה" + the
 *   countdown + what comes next. No CTA — the timer leads.
 */
import React from 'react';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import TimedCardShell from './TimedCardShell';
import TimedNextRow from './TimedNextRow';
import PlayerDrawerCompact from '../../../shared/v2/PlayerDrawerCompact';
import type { SnapDrawerState } from '../../../shared/v2/useSnapDrawer';

export interface TimedClockCardProps {
  mode: 'work' | 'rest';
  eyebrow: string;
  warn: boolean;
  /** Big clock (time left in the phase). */
  clock: string;
  /** "/ 0:20" after the clock (tabata work). */
  ofClock?: string | null;
  /** Work: the current item. Rest: the next one. */
  item: TimedItem | null;
  /** Work: the item after this interval. */
  next?: TimedItem | null;
  nextCaption: string;
  /** "סיימת ב-0:39 · 21 שנ׳ מנוחה" (EMOM). */
  line?: string | null;
  /** enable_strength_drawer_v1: the card as a two-snap drawer. Absent = today's card. */
  drawer?: SnapDrawerState | null;
}

export default function TimedClockCard({ mode, eyebrow, warn, clock, ofClock, item, next, nextCaption, line, drawer = null }: TimedClockCardProps) {
  const isRest = mode === 'rest';
  const compact = drawer ? (
    <PlayerDrawerCompact
      drawer={drawer}
      title={isRest ? (item ? `${nextCaption} · ${item.name}` : nextCaption) : item?.name ?? ''}
      caption={eyebrow}
      value={clock}
      warn={warn}
    />
  ) : null;
  return (
    <TimedCardShell eyebrow={eyebrow} warn={warn} drawer={drawer} compact={compact}>
      <div className="mb-0.5 flex justify-center">
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ring-1 ring-inset ${
            isRest ? 'bg-v2-surface text-v2-ink-2 ring-v2-hairline' : 'bg-v2-tint text-v2-deep ring-v2-accent/40'
          }`}
        >
          {isRest ? 'מנוחה' : 'עבודה'}
        </span>
      </div>
      <div className="mb-1 flex items-baseline justify-center gap-1.5" dir="ltr">
        <span className={`text-[44px] font-black leading-[48px] tabular-nums !tracking-[-0.02em] ${warn ? 'text-[#ea580c]' : 'text-v2-ink'}`}>
          {clock}
        </span>
        {ofClock && <span className="text-[16px] font-extrabold tabular-nums text-v2-muted">/ {ofClock}</span>}
      </div>
      {!isRest && item && (
        <p className="mb-2 truncate whitespace-nowrap text-center text-[17px] font-black !tracking-[-0.01em] text-v2-ink">{item.name}</p>
      )}
      {line && <p className="mb-2 truncate whitespace-nowrap text-center text-[12.5px] font-bold text-v2-muted">{line}</p>}
      <div className="mt-1">
        <TimedNextRow caption={nextCaption} item={isRest ? item : next ?? null} />
      </div>
    </TimedCardShell>
  );
}
