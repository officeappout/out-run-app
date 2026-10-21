'use client';

/**
 * P-2a — ריצה: this month vs last month (same stage), km per week (8 weeks,
 * plan goal line when a running plan sets one), pace trend (up = faster),
 * race prediction from running.paceProfile.basePace, the last 3 runs.
 * Data: the last 40 runs (one bounded read, only while this tab is open).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Card, LineChart } from '@/components/ui/v2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { formatRaceClock, selectRacePrediction } from '@/features/home/utils/race-prediction';
import { useRecentOfType } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { monthCompare, paceOf, paceSeries, weeklySeries } from '../../utils/progress-series';
import { formatHours, formatKm, formatPace, monthName, relativeDay } from '../../utils/progress-format';
import { ChartCard, RecentRows, TabEmpty, TabHeaderCard, TabSkeleton } from './TabParts';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

export default function RunTab() {
  const t = useT(profileNs);
  const router = useRouter();
  const running = useUserStore((s) => s.profile?.running);
  const { data, loading } = useRecentOfType('running', true);
  const now = useMemo(() => new Date(), []);
  const runs = useMemo(() => data ?? [], [data]);
  const cmp = useMemo(() => monthCompare(runs, now), [runs, now]);
  const weekly = useMemo(() => weeklySeries(runs, 'km', now), [runs, now]);
  const pace = useMemo(() => paceSeries(runs), [runs]);
  const prediction = useMemo(
    () =>
      selectRacePrediction({
        basePace: running?.paceProfile?.basePace ?? null,
        targetDistance: running?.generatedProgramTemplate?.targetDistance,
        history: null,
        isRunner: true,
        runningProgramsEnabled: false,
        now,
      }),
    [running, now],
  );

  if (loading && !data) return <TabSkeleton />;
  if (runs.length === 0) return <TabEmpty kind="run" text={t('hub.run.empty')} />;

  const month = monthName(now.getMonth());
  const prevMonth = monthName(now.getMonth() - 1);
  const recent = [...runs].reverse().slice(0, 3);

  return (
    <div className="space-y-3">
      <TabHeaderCard
        kind="run"
        title={t('hub.run.title', { month })}
        subtitle={t('hub.run.subtitle', { month: prevMonth })}
        current={cmp.current.km}
        previous={cmp.previous.km}
        hero={{ key: 'km', value: formatKm(cmp.current.km), unit: t('hub.run.hero.unit'), label: t('hub.run.hero.label') }}
        stats={[
          { key: 'n', value: String(cmp.current.count), label: t('hub.run.stat.count') },
          { key: 'pace', value: formatPace(cmp.current.pace), label: t('hub.run.stat.pace') },
          { key: 'time', value: formatHours(cmp.current.minutes), unit: t('hub.run.stat.timeUnit'), label: t('hub.run.stat.time') },
        ]}
      />

      <ChartCard title={t('hub.run.chart.km.title')} hint={t('hub.run.chart.km.hint')}>
        <BarChart data={weekly} highlightKey="now" color={PROGRESS_COLORS.run} height={170} ariaLabel={t('hub.run.chart.km.aria')} />
      </ChartCard>

      {pace.length >= 2 && (
        <ChartCard title={t('hub.run.chart.pace.title')} hint={t('hub.run.chart.pace.hint')}>
          <LineChart data={pace} color={PROGRESS_COLORS.run} formatValue={(v) => formatPace(paceOf(v))} ariaLabel={t('hub.run.chart.pace.aria')} />
        </ChartCard>
      )}

      {prediction.state === 'ready' && (
        <Card padding="none" className="px-4 py-3.5">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hub.run.prediction.title')}</h3>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('hub.run.prediction.basis')}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[prediction.main, ...prediction.others].slice(0, 3).map((r) => (
              <div key={r.km} className="rounded-[16px] bg-v2-surface px-2 py-2.5 text-center ring-1 ring-inset ring-v2-hairline">
                <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{r.label}</p>
                <p className="mt-0.5 text-[17px] font-black tabular-nums text-v2-ink" dir="ltr">
                  {formatRaceClock(r.seconds)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RecentRows
        title={t('hub.run.recent.title')}
        kind="run"
        rows={recent.map((r) => ({
          key: r.id,
          title: t('hub.run.recent.rowTitle', { title: r.title ?? t('hub.run.recent.fallbackTitle'), km: formatKm(r.km) }),
          meta: t('hub.run.recent.rowMeta', { day: relativeDay(r.date, now), pace: formatPace(r.pace), minutes: String(Math.round(r.minutes)) }),
          onClick: () => router.push(`/workouts/${r.id}/history`),
        }))}
      />
    </div>
  );
}
