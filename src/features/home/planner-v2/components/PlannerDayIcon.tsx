'use client';

/**
 * Icons view of one planner day (enable_week_builder_v1) — the home strip's v2 day language
 * (DayIconCellV2): a done day is the track-coloured streak flame (dots when it mixed tracks);
 * today / later with a session is a tile with the track's icon (today: white tile + accent
 * ring; a run coloured by its run type, like RunningDayIcon); rest or a passed day is "Zz".
 */
import { Dumbbell, Footprints } from 'lucide-react';
import StreakFlame from '@/components/ui/v2/StreakFlame';
import { FLAME_TONES } from '@/components/ui/v2/streak';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { getRunCategoryColor, getRunCategoryIcon } from '@/features/home/utils/run-category-icon';
import type { PlannerDayCell } from '../lib/monthCells';

const SIZE = 32;

function PlannedGlyph({ cell }: { cell: PlannerDayCell }) {
  const first = cell.planned[0];
  const today = cell.isToday;
  if (first.track === 'run') {
    const color = getRunCategoryColor(first.runCategory);
    return <span style={{ color: today ? color : `${color}99` }}>{getRunCategoryIcon(first.runCategory, 'h-4 w-4')}</span>;
  }
  if (first.track === 'walk') return <Footprints className="h-4 w-4" style={{ color: today ? TRACK_COLORS.walk : `${TRACK_COLORS.walk}99` }} aria-hidden />;
  return <Dumbbell className="h-4 w-4" style={{ color: today ? '#0284c7' : 'rgba(2,132,199,0.6)' }} aria-hidden />;
}

export default function PlannerDayIcon({ cell }: { cell: PlannerDayCell }) {
  if (cell.kind === 'done') {
    return (
      <span className="relative grid place-items-center" style={{ width: SIZE + 2, height: SIZE + 2 }}>
        <StreakFlame tones={[cell.tones[0]]} size={SIZE} live={cell.isToday} />
        {cell.tones.length > 1 && (
          <span className="absolute -bottom-1 flex items-center gap-[3px]" aria-hidden>
            {cell.tones.map((t) => (
              <span key={t} className="h-[5px] w-[5px] rounded-full" style={{ background: FLAME_TONES[t].hex, boxShadow: '0 0 0 1px #fff' }} />
            ))}
          </span>
        )}
      </span>
    );
  }
  if (cell.kind === 'planned') {
    return (
      <span
        className="grid place-items-center rounded-[11px]"
        style={{
          width: SIZE - 2,
          height: SIZE - 2,
          background: cell.isToday ? '#ffffff' : '#eef8fc',
          boxShadow: cell.isToday ? '0 0 0 2px #00baf7' : undefined,
        }}
      >
        <PlannedGlyph cell={cell} />
      </span>
    );
  }
  return (
    <span className="grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      <span className="select-none font-black italic leading-none" style={{ fontSize: 14, color: '#c3ccd4' }}>
        Z<sup style={{ fontSize: 11, verticalAlign: 'super' }}>z</sup>
      </span>
    </span>
  );
}
