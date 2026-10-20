'use client';

/**
 * SegmentedRing — one ring split into coloured segments (e.g. minutes per
 * activity: strength / run / walk), clockwise from the top, with a big value
 * in the middle. Value-free: the caller renders the centre.
 *
 *   <SegmentedRing segments={[{ key: 'strength', value: 96, color: '#00baf7' }, …]} size={132}>
 *     <span>214</span>
 *   </SegmentedRing>
 */
import type { ReactNode } from 'react';
import { ringArcs } from './segmented-ring';

export interface SegmentedRingProps {
  segments: { key: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  /** Gap between segments, in px along the ring. */
  gap?: number;
  /** Track colour (shown alone when there's nothing yet). */
  track?: string;
  label?: string;
  children?: ReactNode;
}

export default function SegmentedRing({ segments, size = 132, stroke = 14, gap = 6, track = '#eef2f5', label, children }: SegmentedRingProps) {
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const arcs = ringArcs(segments, c, gap);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeLinecap={arcs.length > 1 ? 'butt' : 'round'}
            strokeDasharray={`${a.length} ${c}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
