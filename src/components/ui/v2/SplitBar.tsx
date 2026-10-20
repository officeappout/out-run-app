'use client';

/**
 * SplitBar — one horizontal bar split into coloured shares (e.g. minutes per
 * activity), with an optional legend row under it (icon + label per share).
 * Shares come from `splitWidths` (compare-bars.ts); empty input renders nothing.
 *
 *   <SplitBar ariaLabel="דקות לפי פעילות"
 *     segments={[{ key: 'strength', value: 96, color: '#00baf7', label: 'כוח 96′', icon: <Muscle/>, textColor: '#0284c7' }, …]} />
 */
import type { ReactNode } from 'react';
import { splitWidths } from './compare-bars';

export interface SplitBarSegment {
  key: string;
  value: number;
  color: string;
  /** Legend text ("כוח 96′"); no label → no legend item. */
  label?: string;
  icon?: ReactNode;
  /** Legend text colour (defaults to `color`). */
  textColor?: string;
}

export interface SplitBarProps {
  segments: SplitBarSegment[];
  ariaLabel?: string;
  /** Bar height in px. Default 14. */
  height?: number;
  className?: string;
}

export default function SplitBar({ segments, ariaLabel, height = 14, className = '' }: SplitBarProps) {
  const shares = splitWidths(segments);
  if (shares.length === 0) return null;
  const byKey = new Map(segments.map((s) => [s.key, s]));
  const legend = shares.map((s) => byKey.get(s.key)!).filter((s) => s.label);
  return (
    <div className={className} data-v2-split-bar>
      <div className="flex gap-[3px] overflow-hidden rounded-full" style={{ height }} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
        {shares.map((s) => (
          <span key={s.key} className="h-full" style={{ width: `${s.pct}%`, background: byKey.get(s.key)!.color }} />
        ))}
      </div>
      {legend.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-extrabold" style={{ color: s.textColor ?? s.color }}>
              {s.icon}
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
