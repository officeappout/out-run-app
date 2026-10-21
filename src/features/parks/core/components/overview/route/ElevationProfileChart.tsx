'use client';

/**
 * ElevationProfileChart — the route's stored elevation profile (official_routes
 * `elevationProfile`, 64 samples) as a small area chart inside the expanded
 * leg card (board M-5b). RTL: the start is on the RIGHT. The steepest stretch
 * is shaded and named in the header ("שיא 40 מ׳ · ק״מ 1.6–2.6").
 */

import { useId } from 'react';
import type { ElevationSamples } from '@/features/workout-engine/players/running/lib/route-elevation-ahead';
import { HYBRID_AER as AER } from '../../hybrid/hybrid-colors';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { elevationPaths, elevationSummary } from './route-overview';

const W = 270, H = 56, BASE = 50;

export default function ElevationProfileChart({ samples }: { samples: ElevationSamples }) {
  const t = useT(map);
  const gid = `elev-${useId().replace(/:/g, '')}`;
  const sum = elevationSummary(samples);
  const { line, area, highlight } = elevationPaths(samples, W, BASE);
  const caption = sum.climb
    ? t('overview.route.elevation.peakClimb', { max: String(Math.round(sum.maxM)), from: sum.climb.fromKm.toFixed(1), to: sum.climb.toKm.toFixed(1) })
    : t('overview.route.elevation.peak', { max: String(Math.round(sum.maxM)) });
  return (
    <div>
      <div className="flex justify-between gap-2 whitespace-nowrap text-[12px] font-extrabold text-v2-muted">
        <span className="font-black text-v2-ink">{t('overview.route.elevation.title')}</span>
        <span className="truncate">{caption}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden className="mt-1.5 block overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AER} stopOpacity="0.28" />
            <stop offset="1" stopColor={AER} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {highlight && <rect x={highlight.x} y={2} width={highlight.width} height={BASE - 2} fill="#fff4e0" opacity={0.85} />}
        <line x1={0} y1={BASE} x2={W} y2={BASE} stroke="#e6edf2" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={AER} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
