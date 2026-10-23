'use client';

/**
 * The plan card of the home progress slot (boards PG-1, slot 2): a ring (plan %) beside
 * a kicker, one big value and a line, plus an optional footnote — the same size as the
 * strength program card it swipes with. Text-free: the run / walk cards pass their copy.
 */
import type { ReactNode } from 'react';
import { MiniRing } from '@/components/ui/v2';

export interface PlanProgressCardProps {
  /** Ring + accent colour (a track token). */
  color: string;
  /** Accent text colour on white (AA). */
  textColor: string;
  /** 0–100. */
  pct: number;
  /** Text inside the ring (the formatted percent). */
  ringText: string;
  ringLabel: string;
  kicker: string;
  value: ReactNode;
  line?: string;
  footnote?: { text: string; positive: boolean } | null;
  onClick: () => void;
  /** data-home-plan-card */
  kind: 'run' | 'walk';
}

export default function PlanProgressCard({
  color,
  textColor,
  pct,
  ringText,
  ringLabel,
  kicker,
  value,
  line,
  footnote,
  onClick,
  kind,
}: PlanProgressCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-home-plan-card={kind}
      className="flex h-full w-full flex-col justify-between gap-2 rounded-v2-card bg-white p-3.5 text-start shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <span className="flex w-full items-center gap-3">
        <MiniRing pct={pct} color={color} size={64} stroke={7} label={ringLabel}>
          <span className="relative text-[15px] font-black tabular-nums text-v2-ink">{ringText}</span>
        </MiniRing>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: textColor }}>
            {kicker}
          </span>
          <span className="truncate whitespace-nowrap text-[20px] font-black leading-tight tabular-nums text-v2-ink">{value}</span>
          {line && <span className="truncate whitespace-nowrap text-[13px] font-bold text-v2-ink-2">{line}</span>}
        </span>
      </span>
      {footnote && (
        <span className={`truncate whitespace-nowrap text-[12.5px] font-bold ${footnote.positive ? 'text-[#047857]' : 'text-v2-muted'}`}>
          {footnote.text}
        </span>
      )}
    </button>
  );
}
