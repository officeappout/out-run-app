'use client';

/**
 * The run's line on a cardio feed post (home v2). Draws the location-free
 * shape from feed-route.ts as plain SVG — no map tiles, no coordinates, the
 * first/last 200 m already cut.
 */
import { useId, useMemo } from 'react';
import { routeShapeToSvg } from '../services/feed-route';

const W = 320;
const H = 150;
const LINE = '#65a30d';

export default function RouteLine({ shape, className = '', label = 'קו המסלול' }: { shape: unknown; className?: string; label?: string }) {
  const svg = useMemo(() => routeShapeToSvg(shape, W, H, 18), [shape]);
  const gridId = `rl${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!svg) return null;
  return (
    <div className={`overflow-hidden rounded-[18px] bg-[rgba(132,204,22,0.07)] ring-1 ring-inset ring-v2-hairline ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
        <defs>
          <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="rgba(14,20,25,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#${gridId})`} />
        <path d={svg.d} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d={svg.d} fill="none" stroke={LINE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={svg.start[0]} cy={svg.start[1]} r="5.5" fill="#fff" stroke={LINE} strokeWidth="3" />
        <circle cx={svg.end[0]} cy={svg.end[1]} r="6" fill={LINE} stroke="#fff" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
