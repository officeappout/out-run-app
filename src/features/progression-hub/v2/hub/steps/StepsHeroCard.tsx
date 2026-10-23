'use client';

/**
 * Steps hero (PG-5): an orange ring with the day's steps of its goal, the delta
 * vs the same weekday last week, "% of goal", what is left (≈ minutes of
 * walking) and the day's distance. On the day tab the 7 weekday chips pick
 * the day (the existing page's day navigation).
 */
import { Check } from 'lucide-react';
import { Card, DeltaBadge } from '@/components/ui/v2';
import MiniRing from '@/components/ui/v2/MiniRing';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { common } from '@/messages/ns/common';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { weekdayLabel } from '@/lib/i18n/units';
import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { HUB_COLORS } from '../hub-colors';
import type { StepsHero } from './steps-hub.model';

const ORANGE = HUB_COLORS.steps;

export function dayLabelKey(offset: number): 'steps.day.today' | 'steps.day.yesterday' | null {
  return offset === 0 ? 'steps.day.today' : offset === 1 ? 'steps.day.yesterday' : null;
}

export default function StepsHeroCard({
  hero,
  isDay,
  dayOffset,
  snapshots,
  onPickDay,
}: {
  hero: StepsHero;
  isDay: boolean;
  dayOffset: number;
  snapshots: readonly DailyStepsSnapshot[];
  onPickDay: (offset: number) => void;
}) {
  const t = useT(profileNs);
  const tc = useT(common);
  const n = (v: number) => formatNumber(Math.round(v), t.locale);
  const labelKey = dayLabelKey(isDay ? dayOffset : 0);
  const label = labelKey ? t(labelKey) : t('steps.day.daysAgo', { n: dayOffset });
  const reached = hero.goal > 0 && hero.steps >= hero.goal;
  const last7 = snapshots.slice(-7);

  return (
    <Card padding="none" className="p-4" data-steps-hero>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-extrabold" style={{ color: ORANGE.text }}>{label}</span>
        <DeltaBadge current={hero.steps} previous={hero.lastWeekSameDay} suffix={t('steps.delta.vsLastWeek')} />
      </div>
      <div className="mt-2 flex items-center gap-4">
        <MiniRing pct={hero.pct} color={ORANGE.fill} size={148} stroke={14} label={t('hubV2.steps.hero.ringAria', { steps: n(hero.steps), goal: n(hero.goal) })}>
          <span className="relative flex flex-col items-center leading-none">
            <span className="text-[30px] font-black tabular-nums tracking-[-0.02em] text-v2-ink" dir="ltr">{n(hero.steps)}</span>
            <span className="mt-1.5 text-[11.5px] font-bold text-v2-muted">{t('steps.ring.ofGoal', { goal: n(hero.goal) })}</span>
          </span>
        </MiniRing>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[22px] font-black tabular-nums text-v2-ink" dir="ltr">
            {n(Math.min(999, hero.pct))}%
          </p>
          <p className="text-[12.5px] font-bold text-v2-muted">{t('hubV2.steps.hero.ofGoal')}</p>
          {reached ? (
            <p className="inline-flex items-center gap-1 text-[13px] font-extrabold" style={{ color: ORANGE.text }}>
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              {t('steps.goal.reached')}
            </p>
          ) : (
            <p className="text-[13px] font-extrabold text-v2-ink-2">
              {t('hubV2.steps.hero.remaining', { steps: n(hero.remaining), minutes: hero.walkMinutes })}
            </p>
          )}
          <p className="text-[13px] font-extrabold text-v2-ink-2">
            {t(hero.kmIsEstimate ? 'hubV2.steps.hero.kmEstimate' : 'hubV2.steps.hero.km', {
              km: formatNumber(Math.round(hero.km * 10) / 10, t.locale, { maximumFractionDigits: 1 }),
            })}
          </p>
        </div>
      </div>
      {isDay && last7.length > 0 && (
        // dir=ltr: oldest on the left, like the chart below (time runs left → right).
        <div className="mt-3 flex gap-1" dir="ltr" role="group" aria-label={t('steps.chart.last7Days')}>
          {last7.map((s, i) => {
            const offset = last7.length - 1 - i;
            const d = new Date(s.date + 'T00:00:00');
            const active = offset === dayOffset;
            return (
              <button
                key={s.date}
                type="button"
                onClick={() => onPickDay(offset)}
                aria-pressed={active}
                className={`h-8 flex-1 rounded-full text-[13px] font-extrabold transition-colors duration-200 ease-v2 ${active ? 'text-white' : 'bg-v2-surface text-v2-muted'}`}
                style={active ? { background: ORANGE.fill } : undefined}
              >
                {weekdayLabel(d.getDay(), 'letter', tc)}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
