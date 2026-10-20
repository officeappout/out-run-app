'use client';

/**
 * P-1a — the 7-day strip (a flame per active day, tinted by activity);
 * P-1b — the month calendar (a tinted cell per active day, lighter < 20 min).
 */
import { Flame } from 'lucide-react';
import { Card, StreakFlame } from '@/components/ui/v2';
import { FLAME_TONES, type FlameTone } from '@/components/ui/v2/streak';
import type { ActivityDayCell, ProgressPeriod } from '../utils/progress-period';
import { WEEKDAY_SHORT } from '../utils/progress-format';

export interface ActivityDaysCardProps {
  period: ProgressPeriod;
  cells: ActivityDayCell[];
  /** Month only: blank cells before the 1st. */
  lead?: number;
  currentStreak: number;
  /** Month only: longest run of active days this month. */
  bestRun?: number;
}

const LEGEND: { tone: FlameTone; label: string }[] = [
  { tone: 'strength', label: 'כוח' },
  { tone: 'cardio', label: 'ריצה' },
  { tone: 'steps', label: 'הליכה' },
];

export default function ActivityDaysCard({ period, cells, lead = 0, currentStreak, bestRun = 0 }: ActivityDaysCardProps) {
  const active = cells.filter((c) => !c.isFuture && c.tones.length > 0).length;
  return (
    <Card padding="none" className="p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">
          {active} ימי פעילות {period === 'week' ? 'השבוע' : ''}
        </span>
        {period === 'week' && currentStreak > 0 && (
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
            <Flame className="h-4 w-4" aria-hidden />
            רצף {currentStreak} ימים
          </span>
        )}
        {period === 'month' && bestRun > 1 && (
          <span className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">רצף שיא החודש · {bestRun} ימים</span>
        )}
      </div>

      {period === 'week' ? (
        <div className="flex gap-0.5">
          {cells.map((c) => (
            <div
              key={c.iso}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-[14px] py-1.5 ${c.isToday ? 'bg-v2-tint' : ''}`}
            >
              <span className={`text-[11.5px] font-extrabold ${c.isToday ? 'text-v2-deep' : 'text-v2-muted'}`}>{WEEKDAY_SHORT[c.weekday]}</span>
              <span className="grid h-[30px] place-items-center">
                {c.tones.length > 0 ? (
                  <StreakFlame tones={c.tones} size={26} live={c.isToday} />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-v2-hairline" />
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_SHORT.map((d) => (
              <span key={d} className="text-[11px] font-extrabold text-v2-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {cells.map((c) => {
              const tone = c.tones[0];
              const hex = tone ? FLAME_TONES[tone].hex : null;
              return (
                <span
                  key={c.iso}
                  className={`grid aspect-square place-items-center rounded-[10px] text-[12px] font-extrabold tabular-nums ${
                    c.isFuture ? 'text-v2-pill-border' : hex ? 'text-white' : 'bg-v2-surface text-v2-muted'
                  } ${c.isToday ? 'ring-2 ring-v2-accent ring-offset-1' : ''}`}
                  style={hex ? { background: hex, opacity: c.minutes > 0 && c.minutes < 20 ? 0.5 : 1 } : undefined}
                >
                  {c.dayOfMonth}
                </span>
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-extrabold text-v2-muted">
            {LEGEND.map((l) => (
              <span key={l.tone} className="inline-flex items-center gap-[5px] whitespace-nowrap">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: FLAME_TONES[l.tone].hex }} />
                {l.label}
              </span>
            ))}
            <span className="whitespace-nowrap">בהיר = פחות מ-20 דק׳</span>
          </div>
        </>
      )}
    </Card>
  );
}
