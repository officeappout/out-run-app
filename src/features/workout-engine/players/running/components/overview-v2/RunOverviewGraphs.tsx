'use client';

/**
 * The run overview's graph pager pages (boards M-6a / 6f):
 *   page 1 — the intensity profile (ProfileStrip, #462)
 *   page 2 — "גובה לאורך האימון": the chosen route's elevation along the
 *            whole workout with its segments as bands (only with a route
 *            that stores an elevation profile).
 */

import { useId } from 'react';
import { ProfileStrip } from '@/components/ui/v2';
import type { RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import { ELEV_W, type WorkoutElevationGeometry } from '../../utils/run-overview/run-elevation-bands';

const LINE = '#00baf7';

export function IntensityPage({ model, swipeHint }: { model: RunPreviewModel; swipeHint: boolean }) {
  return (
    <div>
      {swipeHint && (
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">עצימות</span>
          <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">החלק לגובה המסלול ›</span>
        </div>
      )}
      <ProfileStrip segments={model.strip} height={44} labels={model.stripLabels} />
    </div>
  );
}

export function ElevationPage({ geo }: { geo: WorkoutElevationGeometry }) {
  const gid = `run-elev-${useId().replace(/:/g, '')}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">גובה לאורך האימון</span>
        <span className="truncate whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{geo.caption}</span>
      </div>
      <svg viewBox={`0 0 ${ELEV_W} 102`} width="100%" height={102} preserveAspectRatio="none" aria-hidden className="mt-2.5 block overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={LINE} stopOpacity="0.25" />
            <stop offset="1" stopColor={LINE} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={0} y1={70} x2={ELEV_W} y2={70} stroke="#e6edf2" />
        {geo.laps.map((l) => (
          <g key={l.label}>
            <line x1={l.x} y1={6} x2={l.x} y2={70} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="3 3" />
            <text x={l.x - 4} y={14} fontSize={11} fontWeight={800} fill="#64748b" textAnchor="end">{l.label}</text>
          </g>
        ))}
        <path d={geo.area} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke={LINE} strokeWidth={2.3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={geo.peak.x} cy={geo.peak.y} r={3.5} fill="#fff" stroke={LINE} strokeWidth={2.3} />
        <text x={geo.peak.x} y={geo.peak.y - 8} fontSize={11} fontWeight={900} fill="#0e1419" textAnchor="middle">{geo.peak.label}</text>
        {geo.bands.map((b) => <rect key={b.key} x={b.x} y={74} width={b.width} height={8} rx={2} fill={b.color} />)}
        {geo.ticks.map((t) => (
          <text key={`${t.label}-${t.x}`} x={t.x} y={98} fontSize={11} fontWeight={800} fill="#64748b" textAnchor="middle">{t.label}</text>
        ))}
      </svg>
      <div className="mt-0.5 flex flex-wrap gap-3 text-[11.5px] font-extrabold text-v2-ink-2">
        {geo.legend.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span aria-hidden className="h-[9px] w-[9px] rounded-[3px]" style={{ background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
