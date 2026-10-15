'use client';

import { computeDelta } from './logic';

export interface DeltaBadgeProps {
  current: number;
  /** Baseline to compare against. Missing/zero baseline → renders nothing. */
  previous: number | null | undefined;
  /** Text after the percent, e.g. "מול שבוע שעבר". */
  suffix?: string;
  /** On a dark surface. */
  inverted?: boolean;
  className?: string;
}

/** DeltaBadge — ▲/▼ N% pill. Hidden when there is no real baseline. */
export default function DeltaBadge({ current, previous, suffix, inverted = false, className = '' }: DeltaBadgeProps) {
  const delta = computeDelta(current, previous);
  if (!delta) return null;

  const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '•';
  const tone =
    delta.direction === 'up'
      ? inverted ? 'bg-[#00a86a]/25 text-[#5ff0b6]' : 'bg-[#00a86a]/10 text-[#00845a]'
      : delta.direction === 'down'
        ? inverted ? 'bg-[#e5484d]/25 text-[#ff9b9e]' : 'bg-[#e5484d]/10 text-[#c8353a]'
        : inverted ? 'bg-white/10 text-white/70' : 'bg-v2-surface text-v2-muted';

  return (
    <span
      data-v2-delta={delta.direction}
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-extrabold tabular-nums ${tone} ${className}`}
    >
      <span aria-hidden className="text-[9px]">{arrow}</span>
      <span dir="ltr">{delta.pct}%</span>
      {suffix && <span className="font-semibold opacity-80">{suffix}</span>}
    </span>
  );
}
