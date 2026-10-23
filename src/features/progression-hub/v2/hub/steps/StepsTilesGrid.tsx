'use client';

/**
 * The range's tiles (PG-5): total, daily average, best day (with its date),
 * days in goal, the goal streak and the distance — the same numbers as the
 * existing steps page (deriveStepsStats), in the hub's orange.
 */
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Flame, Route, Sigma, Target, Trophy } from 'lucide-react';
import { Card, DeltaBadge } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { formatDateLoose } from '@/lib/i18n/fmt-display';
import type { StepsTimeRange } from '@/features/activity/lib/steps-analytics.logic';
import { HUB_COLORS } from '../hub-colors';
import type { StepsTiles } from './steps-hub.model';

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  wide = false,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  wide?: boolean;
  delta?: { current: number; previous: number | null };
}) {
  return (
    <Card padding="none" className={`p-3.5 ${wide ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px]" style={{ background: HUB_COLORS.steps.tile, color: HUB_COLORS.steps.text }} aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <span className="truncate text-[12px] font-bold text-v2-muted">{label}</span>
      </div>
      <p className="mt-2 text-[20px] font-black tabular-nums text-v2-ink">
        <span dir="ltr">{value}</span>
        {unit && <span className="ms-1 text-[12px] font-bold text-v2-muted">{unit}</span>}
      </p>
      {delta && <DeltaBadge className="mt-1.5" current={delta.current} previous={delta.previous} />}
    </Card>
  );
}

export default function StepsTilesGrid({ tiles, range }: { tiles: StepsTiles; range: StepsTimeRange }) {
  const t = useT(profileNs);
  const n = (v: number) => formatNumber(Math.round(v), t.locale);
  const steps = t('steps.unit.steps');
  const bestLabel = tiles.bestDate
    ? t('hubV2.steps.tile.bestOn', { date: formatDateLoose(new Date(tiles.bestDate + 'T00:00:00'), t.locale, { day: 'numeric', month: 'numeric' }) })
    : t('steps.stat.best');
  return (
    <div className="grid grid-cols-2 gap-2.5" data-steps-tiles>
      {range !== 'day' && <Tile icon={Sigma} label={t('hubV2.steps.tile.total', { range })} value={n(tiles.totalSteps)} unit={steps} />}
      <Tile
        icon={CalendarDays}
        label={t('steps.stat.dailyAverage')}
        value={n(tiles.averageDaily)}
        unit={steps}
        delta={tiles.previousAverage != null ? { current: tiles.averageDaily, previous: tiles.previousAverage } : undefined}
      />
      <Tile icon={Trophy} label={bestLabel} value={tiles.bestDay > 0 ? n(tiles.bestDay) : '—'} unit={tiles.bestDay > 0 ? steps : undefined} />
      <Tile icon={Target} label={t('steps.stat.daysAtGoal')} value={`${n(tiles.daysAtGoal)}/${n(tiles.daysWithData)}`} />
      <Tile icon={Flame} label={t('steps.stat.streak')} value={n(tiles.streak)} unit={t('steps.unit.days')} />
      <Tile
        icon={Route}
        label={t('steps.stat.distance')}
        value={formatNumber(Math.round(tiles.distanceKm * 10) / 10, t.locale, { maximumFractionDigits: 1 })}
        unit={t('steps.unit.km')}
        wide={range === 'day'}
      />
    </div>
  );
}
