'use client';

/**
 * /progress/strength — the hub's strength page (PG-4, cyan):
 *   this week vs last (sets · workouts · time) → progression maps (the profile's
 *   ProgramsSection in its v2 look: main program ring + child programs, each →
 *   /progression-map/[id]; "not assessed yet"; other programs) → insights (real
 *   data only) → muscle balance this month → sets per week → your exercises
 *   with their trend → discover more programs.
 * Reads: the last 40 strength workouts + 8 exerciseHistory docs (bounded, cached).
 */
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { useProgressHubBuckets } from '@/features/progression-map/hooks/useProgressHubBuckets';
import { DiscoverMoreSection } from '../../../components/DiscoverMoreSection';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useRecentOfType, useProgressUid } from '../../hooks/useProgressData';
import { useBoundedQuery } from '../../hooks/useBoundedQuery';
import { weekCompare } from '../../utils/progress-series';
import { formatHours } from '../../utils/progress-format';
import { TabHeaderCard, TabSkeleton } from '../../components/tabs/TabParts';
import HubPageShell from '../components/HubPageShell';
import VolumeChart from '../components/VolumeChart';
import { HUB_COLORS } from '../hub-colors';
import { useProgressHubFlag } from '../useProgressHubFlag';
import { getExerciseTrends } from './exercise-trends.service';
import { imbalanceInsight, monthDomainSets, mostImproved, newRecord, weeklySets } from './strength-page.model';
import StrengthInsightsCard from './StrengthInsightsCard';
import MuscleBalanceCard from './MuscleBalanceCard';
import StrengthExercisesList from './StrengthExercisesList';

const ProgramsSection = dynamic(() => import('@/features/profile/components/widgets/ProgramsSection'), { ssr: false });

function StrengthBody() {
  const t = useT(profileNs);
  const uid = useProgressUid();
  const { data, loading } = useRecentOfType('strength', true);
  const ex = useBoundedQuery(uid ? `exTrends:${uid}` : null, () => getExerciseTrends(uid as string, 8));
  const { ready, buckets } = useProgressHubBuckets();
  const now = useMemo(() => new Date(), []);
  const ws = useMemo(() => data ?? [], [data]);
  const exercises = useMemo(() => ex.data ?? [], [ex.data]);
  const cmp = useMemo(() => weekCompare(ws, now), [ws, now]);
  const domains = useMemo(() => monthDomainSets(ws, now), [ws, now]);
  const weekly = useMemo(() => weeklySets(ws, now), [ws, now]);
  const n = (v: number) => formatNumber(v, t.locale);

  return (
    <>
      {loading && !data ? (
        <TabSkeleton />
      ) : (
        ws.length > 0 && (
          <TabHeaderCard
            kind="strength"
            title={t('hub.strength.title')}
            subtitle={t('hub.strength.subtitle')}
            current={cmp.current.sets}
            previous={cmp.previous.sets}
            hero={{ key: 'sets', value: String(cmp.current.sets), unit: t('hub.strength.hero.unit'), label: t('hub.strength.hero.label') }}
            stats={[
              { key: 'n', value: String(cmp.current.count), label: t('hub.strength.stat.count') },
              { key: 'time', value: formatHours(cmp.current.minutes), unit: t('hub.strength.stat.timeUnit'), label: t('hub.strength.stat.time') },
            ]}
          />
        )
      )}

      <section className="space-y-2" data-strength-maps>
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.strength.maps.title')}</h3>
        <WidgetBoundary name="progressHub.strength.programs">
          <ProgramsSection v2 />
        </WidgetBoundary>
      </section>

      <StrengthInsightsCard improved={mostImproved(exercises)} imbalance={imbalanceInsight(domains)} record={newRecord(exercises, now)} />
      <MuscleBalanceCard domains={domains} />

      {weekly.some((w) => w.done > 0) && (
        <Card padding="none" className="px-4 py-3.5" data-strength-weekly>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.strength.weekly.title')}</h3>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('hubV2.strength.weekly.hint')}</span>
          </div>
          <VolumeChart
            data={weekly}
            color={HUB_COLORS.strength.fill}
            format={n}
            ariaLabel={t('hubV2.strength.weekly.title')}
            describe={(d) => t('hubV2.strength.weekly.rowAria', { label: d.label, sets: n(d.done) })}
          />
          <p className="mt-2 text-[12.5px] font-extrabold" style={{ color: HUB_COLORS.strength.text }}>
            {t('hubV2.strength.weekly.thisWeek', { sets: n(cmp.current.sets), count: cmp.current.count, time: formatHours(cmp.current.minutes) })}
          </p>
        </Card>
      )}

      <StrengthExercisesList items={exercises} />

      {ready && <DiscoverMoreSection items={buckets.discover} />}
    </>
  );
}

export default function StrengthHubPage() {
  const t = useT(profileNs);
  const { on } = useProgressHubFlag();
  return (
    <HubPageShell kind="strength" title={t('hubV2.strength.page.title')} subtitle={t('hubV2.strength.page.subtitle')}>
      {on && <StrengthBody />}
    </HubPageShell>
  );
}
