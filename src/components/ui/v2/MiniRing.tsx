'use client';

/**
 * MiniRing — a small progress ring with an optional second, lighter arc for what is
 * planned on top ("5,600 done + ~3,200 from today's walk"). Value-free: the caller
 * puts any label next to / inside it.
 *
 *   <MiniRing pct={70} plannedPct={40} color="#f59e0b" size={56}>
 *     <Footprints size={18} />
 *   </MiniRing>
 */
import type { ReactNode } from 'react';

export interface MiniRingProps {
  /** 0–100, done. */
  pct: number;
  /** 0–100, planned on top of `pct` (drawn lighter, after the done arc). */
  plannedPct?: number;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  children?: ReactNode;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

export default function MiniRing({ pct, plannedPct = 0, color, size = 56, stroke = 7, label, children }: MiniRingProps) {
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const done = clampPct(pct);
  const planned = Math.min(100 - done, clampPct(plannedPct));
  const cx = size / 2;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={stroke} />
        {planned > 0 && (
          <circle
            cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${(c * planned) / 100} ${c}`}
            strokeDashoffset={-(c * done) / 100}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
        {done > 0 && (
          <circle
            cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - done / 100)}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        )}
      </svg>
      {children}
    </span>
  );
}
