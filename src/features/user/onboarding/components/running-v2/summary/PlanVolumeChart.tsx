'use client';

/** Relative weekly volume bars for the plan summary (moved out of RunningPlanSummaryV2). */
import type { PlanWeekBar } from '../../../utils/running-plan-shape';
import { weekLabelsToShow } from '../../../utils/running-plan-shape';

export const BAR_COLOR: Record<PlanWeekBar['kind'], string> = {
  build: '#00baf7',
  recovery: '#bfe3f2',
  goal: '#ffc83d',
};

export default function PlanVolumeChart({ bars }: { bars: PlanWeekBar[] }) {
  const labels = weekLabelsToShow(bars.length);
  const gap = bars.length > 20 ? 2 : 4;
  return (
    <div>
      <div className="flex h-[92px] items-end" style={{ gap }} role="img" aria-label={`נפח שבועי יחסי לאורך ${bars.length} שבועות`}>
        {bars.map((b) => (
          <div key={b.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-[6px]"
              style={{
                height: `${Math.max(8, Math.round(b.relative * 100))}%`,
                background: b.week === 1 && b.kind === 'build' ? '#0284c7' : BAR_COLOR[b.kind],
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex" style={{ gap }} aria-hidden>
        {bars.map((b) => (
          <span key={b.week} className="min-w-0 flex-1 text-center text-[11px] font-extrabold tabular-nums text-v2-muted">
            {labels.has(b.week) ? b.week : ''}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-extrabold text-v2-muted">
        {([
          ['build', 'בנייה'],
          ['recovery', 'שבוע קל'],
          ['goal', 'שבוע המטרה'],
        ] as const).map(([k, label]) =>
          k === 'recovery' && !bars.some((b) => b.kind === 'recovery') ? null : (
            <span key={k} className="inline-flex items-center gap-[5px] whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BAR_COLOR[k] }} />
              {label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
