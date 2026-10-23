'use client';

/**
 * Steps card (PG-2, orange): ring = today vs the step goal, "6,240 of 8,000
 * today", the period's daily average and days in goal. Reads nothing — the
 * period read's dailyActivity docs. Tap → /progress/steps.
 */
import { useRouter } from 'next/navigation';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { ProgressDay } from '../../utils/progress-model';
import type { DayRange, ProgressPeriod } from '../../utils/progress-period';
import { stepsCardModel } from '../model/domain-cards.model';
import { HUB_ROUTES } from '../hub-routes';
import DomainCard from '../components/DomainCard';

export default function StepsDomainCard({
  period,
  days,
  current,
  now,
}: {
  period: ProgressPeriod;
  days: readonly ProgressDay[];
  current: DayRange;
  now: Date;
}) {
  const t = useT(profileNs);
  const router = useRouter();
  const m = stepsCardModel(days, current, now, DAILY_STEP_GOAL);
  const n = (v: number) => formatNumber(v, t.locale);
  return (
    <DomainCard
      kind="steps"
      title={t('hubV2.steps.card.title')}
      pct={m ? m.pct : null}
      ringLabel={m ? t('hubV2.card.ringAria', { pct: n(m.pct) }) : undefined}
      lines={
        m
          ? [
              t('hubV2.steps.card.today', { steps: n(m.today), goal: n(m.goal) }),
              t('hubV2.steps.card.average', { period, average: n(m.average) }),
              t('hubV2.steps.card.days', { days: n(m.daysInGoal), total: n(m.daysCounted) }),
            ]
          : [t('hubV2.steps.card.empty')]
      }
      onOpen={() => router.push(HUB_ROUTES.steps)}
      ariaLabel={t('hubV2.card.open', { name: t('hubV2.steps.card.title') })}
      locale={t.locale}
    />
  );
}
