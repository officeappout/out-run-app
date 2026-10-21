'use client';

/**
 * P-2c — הליכה: walks saved as a workout this month vs last month, walking
 * minutes per week (8 weeks), the last 3 walks. Data: the last 40 walks.
 * The walking-plan card waits until walkPlan stores a week/progress state.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart } from '@/components/ui/v2';
import { useRecentOfType } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { monthCompare, weeklySeries } from '../../utils/progress-series';
import { formatHours, formatKm, formatPace, monthName, relativeDay } from '../../utils/progress-format';
import { ChartCard, RecentRows, TabEmpty, TabHeaderCard, TabSkeleton } from './TabParts';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

export default function WalkTab() {
  const t = useT(profileNs);
  const router = useRouter();
  const { data, loading } = useRecentOfType('walking', true);
  const now = useMemo(() => new Date(), []);
  const walks = useMemo(() => data ?? [], [data]);
  const cmp = useMemo(() => monthCompare(walks, now), [walks, now]);
  const weekly = useMemo(() => weeklySeries(walks, 'minutes', now), [walks, now]);

  if (loading && !data) return <TabSkeleton />;
  if (walks.length === 0) return <TabEmpty kind="walk" text={t('hub.walk.empty')} />;

  const recent = [...walks].reverse().slice(0, 3);
  return (
    <div className="space-y-3">
      <TabHeaderCard
        kind="walk"
        title={t('hub.walk.title', { month: monthName(now.getMonth()) })}
        subtitle={t('hub.walk.subtitle')}
        current={cmp.current.km}
        previous={cmp.previous.km}
        hero={{ key: 'km', value: formatKm(cmp.current.km), unit: t('hub.walk.hero.unit'), label: t('hub.walk.hero.label') }}
        stats={[
          { key: 'n', value: String(cmp.current.count), label: t('hub.walk.stat.count') },
          { key: 'time', value: formatHours(cmp.current.minutes), unit: t('hub.walk.stat.timeUnit'), label: t('hub.walk.stat.time') },
          { key: 'pace', value: formatPace(cmp.current.pace), label: t('hub.walk.stat.pace') },
        ]}
      />
      <ChartCard title={t('hub.walk.chart.title')} hint={t('hub.walk.chart.hint')}>
        <BarChart data={weekly} highlightKey="now" color={PROGRESS_COLORS.walk} height={170} ariaLabel={t('hub.walk.chart.aria')} />
      </ChartCard>
      <RecentRows
        title={t('hub.walk.recent.title')}
        kind="walk"
        rows={recent.map((w) => ({
          key: w.id,
          title: t('hub.walk.recent.rowTitle', { title: w.title ?? t('hub.walk.recent.fallbackTitle'), km: formatKm(w.km) }),
          meta: t('hub.walk.recent.rowMeta', { day: relativeDay(w.date, now), minutes: String(Math.round(w.minutes)) }),
          onClick: () => router.push(`/workouts/${w.id}/history`),
        }))}
      />
    </div>
  );
}
