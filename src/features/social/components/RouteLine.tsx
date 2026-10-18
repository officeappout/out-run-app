'use client';

/**
 * The run's line on a cardio feed post (home v2). Draws the location-free
 * shape from feed-route.ts as plain SVG — no map tiles, no coordinates, the
 * first/last 200 m already cut.
 *
 * variant 'card' (default): the framed 320×150 line (share sheet, old card).
 * variant 'hero': no frame, fills its box (the run post's hero / inset).
 */
import { useId, useMemo } from 'react';
import { routeShapeToSvg } from '../services/feed-route';

const W = 320;
const H = 150;
const LINE = '#65a30d';

export default function RouteLine({
  shape,
  className = '',
  label = 'קו המסלול',
  variant = 'card',
  width = W,
  height = H,
}: {
  shape: unknown;
  className?: string;
  label?: string;
  variant?: 'card' | 'hero';
  width?: number;
  height?: number;
}) {
  const hero = variant === 'hero';
  const w = hero ? width : W;
  const h = hero ? height : H;
  const svg = useMemo(() => routeShapeToSvg(shape, w, h, hero ? Math.round(Math.min(w, h) * 0.14) : 18), [shape, w, h, hero]);
  const gridId = `rl${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!svg) return null;
  const k = hero ? Math.max(1, Math.min(w, h) / 150) : 1;
  const lines = (
    <>
      <path d={svg.d} fill="none" stroke="#fff" strokeWidth={8 * k} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svg.d} fill="none" stroke={LINE} strokeWidth={4 * k} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={svg.start[0]} cy={svg.start[1]} r={5.5 * k} fill="#fff" stroke={LINE} strokeWidth={3 * k} />
      <circle cx={svg.end[0]} cy={svg.end[1]} r={6 * k} fill={LINE} stroke="#fff" strokeWidth={2.5 * k} />
    </>
  );
  if (hero) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className={`block h-full w-full ${className}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        {lines}
      </svg>
    );
  }
  return (
    <div className={`overflow-hidden rounded-[18px] bg-[rgba(132,204,22,0.07)] ring-1 ring-inset ring-v2-hairline ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
        <defs>
          <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="rgba(14,20,25,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#${gridId})`} />
        {lines}
      </svg>
    </div>
  );
}
