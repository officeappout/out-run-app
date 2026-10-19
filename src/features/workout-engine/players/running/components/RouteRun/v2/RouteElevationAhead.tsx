'use client';

/**
 * RouteElevationAhead — elevation strip for a live route run (board
 * R3-prop-route-live): "ק״מ 2.2 מתוך 5.2" + the next climb, the profile
 * (cardio green), a dashed "you are here" line with a dot, and km ticks.
 *
 * Renders NOTHING unless the route has elevation samples — and no route has
 * them today (see lib/route-elevation-ahead). Presentational + pure geometry;
 * `alongM` / `totalM` are the same along-route metres NavBannerV2 shows as %.
 * Slot-able: NavBannerV2 mounts it under its progress row; the continuous-run
 * player sheet can mount it instead.
 */

import React, { useMemo } from 'react';
import {
  buildElevationStrip, climbLabel, nextClimbAhead, profileLengthM, type ElevationSamples,
} from '../../../lib/route-elevation-ahead';

const W = 350;
const H = 40;
const CARDIO = '#65a30d';
const CARDIO_FILL = '#e3f2c9';
const ACCENT = '#00baf7';

export interface RouteElevationAheadProps {
  samples: ElevationSamples | null | undefined;
  /** Metres along the route (null before the user joined it). */
  alongM: number | null;
  /** Route length (m) the progress is measured against. */
  totalM: number;
  className?: string;
}

export default function RouteElevationAhead({ samples, alongM, totalM, className = '' }: RouteElevationAheadProps) {
  const geo = useMemo(
    () => (samples ? buildElevationStrip(samples, alongM, totalM, { width: W, height: H }) : null),
    [samples, alongM, totalM],
  );
  const climb = useMemo(() => {
    if (!samples || totalM <= 0) return null;
    const scale = profileLengthM(samples) / totalM;
    const c = nextClimbAhead(samples, (alongM ?? 0) * scale);
    return c ? { ...c, inM: c.inM / scale } : null;
  }, [samples, alongM, totalM]);

  if (!samples || !geo) return null;
  const doneKm = Math.max(0, Math.min(totalM, alongM ?? 0)) / 1000;
  const label = climbLabel(climb);

  return (
    <div dir="rtl" className={className} aria-label="פרופיל גובה לאורך המסלול">
      <div className="mb-1 flex items-center justify-between gap-3 text-[12px] font-extrabold text-v2-muted">
        <span className="whitespace-nowrap tabular-nums">
          ק״מ {doneKm.toFixed(1)} מתוך {(totalM / 1000).toFixed(1)}
        </span>
        {label && <span className="min-w-0 truncate">{label}</span>}
      </div>
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden className="block">
          <path d={geo.areaD} fill={CARDIO_FILL} />
          <path d={geo.lineD} fill="none" stroke={CARDIO} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {alongM != null && (
            <line
              x1={geo.you.x} y1={0} x2={geo.you.x} y2={H}
              stroke="#0e1419" strokeWidth={2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* The dot lives outside the stretched SVG so it stays round at any width. */}
        {alongM != null && (
          <span
            aria-hidden
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
            style={{ left: `${(geo.you.x / W) * 100}%`, top: geo.you.y, background: ACCENT }}
          />
        )}
      </div>
      <div className="relative mt-0.5 h-4 text-[11px] font-extrabold tabular-nums text-v2-muted">
        {geo.ticks.map((t, i) => (
          <span
            key={`${t.label}-${i}`}
            className="absolute top-0 whitespace-nowrap"
            style={{
              left: `${(t.x / W) * 100}%`,
              transform: t.x <= 0 ? 'none' : t.x >= W ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
