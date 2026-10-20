'use client';

/**
 * PairedBarRow — "this period vs the previous one" for one metric: a title row
 * (label + optional badge, e.g. a DeltaBadge), then a thick coloured bar for
 * now and a thin grey bar for before, both scaled to the larger value
 * (`pairedWidths`). Values are pre-formatted by the caller.
 */
import type { ReactNode } from 'react';
import { pairedWidths } from './compare-bars';

export interface PairedBarRowProps {
  label: ReactNode;
  badge?: ReactNode;
  current: number;
  previous: number;
  currentText: string;
  previousText: string;
  color: string;
  /** Colour of the "before" bar. Default slate-300. */
  previousColor?: string;
  last?: boolean;
}

export const PAIRED_PREVIOUS_COLOR = '#cbd5e1';

export default function PairedBarRow({
  label,
  badge,
  current,
  previous,
  currentText,
  previousText,
  color,
  previousColor = PAIRED_PREVIOUS_COLOR,
  last = false,
}: PairedBarRowProps) {
  const w = pairedWidths(current, previous);
  return (
    <div className={`py-2.5 ${last ? '' : 'border-b border-v2-hairline'}`} data-v2-paired-row>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-ink">{label}</span>
        {badge}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eef2f5]">
          <span className="block h-full rounded-full" style={{ width: `${w.current}%`, background: color }} />
        </span>
        <span className="w-[70px] whitespace-nowrap text-left text-[14px] font-black tabular-nums text-v2-ink">{currentText}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef2f5]">
          <span className="block h-full rounded-full" style={{ width: `${w.previous}%`, background: previousColor }} />
        </span>
        <span className="w-[70px] whitespace-nowrap text-left text-[11.5px] font-bold tabular-nums text-v2-muted">{previousText}</span>
      </div>
    </div>
  );
}
