'use client';

/**
 * P-1b — the month calendar (a tinted cell per active day, lighter < 20 min).
 * The week is the home strip itself (ProgressWeekStrip).
 */
import { Card } from '@/components/ui/v2';
import { FLAME_TONES, type FlameTone } from '@/components/ui/v2/streak';
import type { ActivityDayCell } from '../utils/progress-period';
import { WEEKDAY_SHORT } from '../utils/progress-format';
import { useT } from '@/hooks/useT';
import { profile as profileNs, type ProfileKey } from '@/messages/ns/profile';

export interface ActivityDaysCardProps {
  cells: ActivityDayCell[];
  /** Blank cells before the 1st. */
  lead?: number;
  /** Longest run of active days this month. */
  bestRun?: number;
}

const LEGEND: { tone: FlameTone; labelKey: ProfileKey }[] = [
  { tone: 'strength', labelKey: 'hub.days.legend.strength' },
  { tone: 'cardio', labelKey: 'hub.days.legend.cardio' },
  { tone: 'steps', labelKey: 'hub.days.legend.steps' },
];

export default function ActivityDaysCard({ cells, lead = 0, bestRun = 0 }: ActivityDaysCardProps) {
  const t = useT(profileNs);
  const active = cells.filter((c) => !c.isFuture && c.tones.length > 0).length;
  return (
    <Card padding="none" className="p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hub.days.active', { count: String(active) })}</span>
        {bestRun > 1 && <span className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{t('hub.days.bestRun', { count: String(bestRun) })}</span>}
      </div>

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
            {t(l.labelKey)}
          </span>
        ))}
        <span className="whitespace-nowrap">{t('hub.days.lightHint')}</span>
      </div>
    </Card>
  );
}
