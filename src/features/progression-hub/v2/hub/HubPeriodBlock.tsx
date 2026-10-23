'use client';

/**
 * The hub's period block (PG-2): the summary ring vs the previous period (and
 * its comparison sheet), then "by domain" — strength, running (walking variant)
 * and steps. ONE bounded read (usePeriodData, the same as today's tab); the
 * three cards reuse it. A ring chip opens that activity's page.
 *
 * Left out on purpose (owner, 23.10.2026): the week strip / month calendar, the
 * consistency block and the "new record" shortcut.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState, SectionHeader } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { usePeriodData } from '../hooks/useProgressData';
import { summarizePeriod, type ProgressPeriod } from '../utils/progress-period';
import { periodSpark, type SplitKind } from '../utils/period-spark';
import PeriodSummaryRingCard from '../components/PeriodSummaryRingCard';
import PeriodCompareSheet from '../components/PeriodCompareSheet';
import { hubRouteForKind } from './hub-routes';
import StrengthDomainCard from './cards/StrengthDomainCard';
import RunDomainCard from './cards/RunDomainCard';
import StepsDomainCard from './cards/StepsDomainCard';

export default function HubPeriodBlock({ period }: { period: ProgressPeriod }) {
  const t = useT(profileNs);
  const router = useRouter();
  const { data, loading, error, ranges, now } = usePeriodData(period);
  const [compareOpen, setCompareOpen] = useState(false);
  const openCompare = useCallback(() => setCompareOpen(true), []);
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const openKind = useCallback((k: SplitKind) => router.push(hubRouteForKind(k)), [router]);
  const model = useMemo(() => {
    if (!data) return null;
    return {
      current: summarizePeriod(data.workouts, data.days, ranges.current),
      previous: summarizePeriod(data.workouts, data.days, ranges.previous),
      spark: periodSpark(period, ranges.current, data.workouts, data.days, now),
    };
  }, [data, ranges, period, now]);

  if (error) return <ErrorState variant="compact" title={t('hub.screen.error.title')} description={t('hub.screen.error.description')} />;
  if (loading || !model || !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-[250px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[100px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
        ))}
      </div>
    );
  }
  const byKind = model.current.byKind;
  return (
    <div className="space-y-3">
      <PeriodSummaryRingCard
        period={period}
        ranges={ranges}
        current={model.current}
        previous={model.previous}
        spark={model.spark}
        onSelectKind={openKind}
        onOpenCompare={openCompare}
      />
      <WidgetBoundary name="progressHub.compare" fallback={() => null}>
        <PeriodCompareSheet
          open={compareOpen}
          onClose={closeCompare}
          period={period}
          ranges={ranges}
          current={model.current}
          previous={model.previous}
          now={now}
        />
      </WidgetBoundary>

      <section className="space-y-2.5 pt-2" aria-label={t('hubV2.cards.title')}>
        <SectionHeader title={t('hubV2.cards.title')} size={17} />
        <WidgetBoundary name="progressHub.card.strength" fallback={() => null}>
          <StrengthDomainCard period={period} workouts={byKind.strength.count} />
        </WidgetBoundary>
        <WidgetBoundary name="progressHub.card.run" fallback={() => null}>
          <RunDomainCard period={period} run={byKind.run} walk={byKind.walk} />
        </WidgetBoundary>
        <WidgetBoundary name="progressHub.card.steps" fallback={() => null}>
          <StepsDomainCard period={period} days={data.days} current={ranges.current} now={now} />
        </WidgetBoundary>
      </section>
    </div>
  );
}
