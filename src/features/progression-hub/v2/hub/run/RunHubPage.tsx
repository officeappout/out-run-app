'use client';

/**
 * /progress/run — the hub's running page (PG-3; running stays GREEN). Same
 * variant as the main page's card:
 *   running plan → plan hero · weekly volume (done vs planned, km/min) · the
 *                  plan by weeks · forecast + trend · pace zones · recent runs
 *   walking plan → WalkHubBody (orange)
 *   no plan      → this month's runs · weekly volume · forecast · zones · recent
 * Reads: the last 40 runs (bounded, as the old run tab) + the plan detail
 * (run-plan.loader, only with a plan). Pace zones need the pace-map config,
 * which the plan detail loads; without a plan it is read on its own (1 doc).
 */
import { useCallback, useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getPaceMapConfig } from '@/features/workout-engine/core/services/running-admin.service';
import { computeZones } from '@/features/workout-engine/core/services/running-engine.service';
import { buildZoneLadder } from '@/features/workout-engine/players/running/utils/run-preview/run-zone-ladder';
import type { ActiveRunningProgram, PaceProfile } from '@/features/workout-engine/core/types/running.types';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { readDate } from '../../utils/progress-model';
import { runningPlanProgress } from '../../utils/running-plan-progress';
import { monthCompare, paceOf, paceSeries } from '../../utils/progress-series';
import { LineChart } from '@/components/ui/v2';
import { ChartCard } from '../../components/tabs/TabParts';
import { formatHours, formatKm, formatPace, monthName } from '../../utils/progress-format';
import { useRecentOfType, useProgressUid } from '../../hooks/useProgressData';
import { useBoundedQuery } from '../../hooks/useBoundedQuery';
import { TabEmpty, TabHeaderCard, TabSkeleton } from '../../components/tabs/TabParts';
import HubPageShell from '../components/HubPageShell';
import { HUB_COLORS } from '../hub-colors';
import { useWalkPlanWeek } from '../model/useWalkPlanWeek';
import { useProgressHubFlag } from '../useProgressHubFlag';
import { usePlanName } from '../model/usePlanName';
import { loadRunPlanDetail } from './run-plan.loader';
import { buildPlanWeeks, planTotals, planVolume, recentVolume, type VolumeUnit } from './run-page.model';
import { forecastModel } from './run-forecast';
import RunPlanHero from './RunPlanHero';
import RunVolumeCard from './RunVolumeCard';
import RunWeeksList from './RunWeeksList';
import RunForecastCard from './RunForecastCard';
import RunZonesCard from './RunZonesCard';
import RecentActivityList from './RecentActivityList';
import WalkHubBody from './WalkHubBody';

type RunningLike = {
  activeProgram?: ActiveRunningProgram | null;
  paceProfile?: PaceProfile | null;
  generatedProgramTemplate?: { targetDistance?: string; name?: string; canonicalWeeks?: number; canonicalFrequency?: number } | null;
  weeklyFrequency?: number;
};

function RunBody() {
  const t = useT(profileNs);
  const uid = useProgressUid();
  const running = useUserStore((s) => s.profile?.running) as RunningLike | undefined;
  const plan = useMemo(() => runningPlanProgress(running as Parameters<typeof runningPlanProgress>[0]), [running]);
  const ap = running?.activeProgram ?? null;
  const pace = running?.paceProfile ?? null;
  const planName = usePlanName(plan?.distKey ?? null, plan?.title ?? '');
  const now = useMemo(() => new Date(), []);
  const { data: runsData, loading } = useRecentOfType('running', true);
  const runs = useMemo(() => runsData ?? [], [runsData]);

  const startISO = ap ? (readDate(ap.startDate)?.toISOString().slice(0, 10) ?? '') : '';
  const detail = useBoundedQuery(
    uid && ap && plan ? `runplan:${uid}:${ap.programId}:${startISO}:${plan.done}` : null,
    () => loadRunPlanDetail(ap as ActiveRunningProgram, pace),
    !!plan,
  );
  const config = useBoundedQuery(uid && !plan && pace?.basePace ? 'pacemap' : null, () => getPaceMapConfig(), !plan && !!pace?.basePace);

  const planStart = useMemo(() => (ap ? readDate(ap.startDate) : null) ?? now, [ap, now]);
  const weeks = useMemo(
    () =>
      plan && detail.data
        ? buildPlanWeeks({ entries: detail.data.entries, weeks: plan.weeks, currentWeek: plan.currentWeek, planStart, phases: detail.data.phases, runs })
        : [],
    [plan, detail.data, planStart, runs],
  );
  const totals = useMemo(
    () => (plan && weeks.length ? planTotals(weeks, planStart, runs.filter((r) => r.date >= planStart)) : null),
    [plan, weeks, planStart, runs],
  );
  const buildVolume = useCallback(
    (unit: VolumeUnit) => (weeks.length ? planVolume(weeks, unit) : recentVolume(runs, unit, now)),
    [weeks, runs, now],
  );
  const forecast = useMemo(
    () => forecastModel(pace ?? null, running?.generatedProgramTemplate?.targetDistance, now),
    [pace, running?.generatedProgramTemplate?.targetDistance, now],
  );
  const ladder = useMemo(() => {
    if (plan) return detail.data ? buildZoneLadder(detail.data.zones, detail.data.nextZone) : [];
    if (pace && pace.basePace > 0 && config.data) return buildZoneLadder(computeZones(pace.basePace, pace.profileType, config.data), null);
    return [];
  }, [plan, detail.data, pace, config.data]);
  const cmp = useMemo(() => monthCompare(runs, now), [runs, now]);
  const recent = useMemo(() => [...runs].reverse().slice(0, 5), [runs]);
  const paceTrend = useMemo(() => paceSeries(runs), [runs]);

  if (loading && !runsData) return <TabSkeleton />;
  if (!plan && runs.length === 0 && forecast.rows.length === 0) return <TabEmpty kind="run" text={t('hub.run.empty')} />;

  return (
    <>
      {plan ? (
        <RunPlanHero plan={plan} planName={planName} totals={totals} />
      ) : (
        runs.length > 0 && (
          <TabHeaderCard
            kind="run"
            title={t('hub.run.title', { month: monthName(now.getMonth(), t.locale) })}
            subtitle={t('hub.run.subtitle', { month: monthName(now.getMonth() - 1, t.locale) })}
            current={cmp.current.km}
            previous={cmp.previous.km}
            hero={{ key: 'km', value: formatKm(cmp.current.km, t.locale), unit: t('hub.run.hero.unit'), label: t('hub.run.hero.label') }}
            stats={[
              { key: 'n', value: String(cmp.current.count), label: t('hub.run.stat.count') },
              { key: 'pace', value: formatPace(cmp.current.pace), label: t('hub.run.stat.pace') },
              { key: 'time', value: formatHours(cmp.current.minutes), unit: t('hub.run.stat.timeUnit'), label: t('hub.run.stat.time') },
            ]}
          />
        )
      )}
      <RunVolumeCard build={buildVolume} tone={HUB_COLORS.run} byPlanWeek={weeks.length > 0} />
      {plan && detail.loading && !detail.data && <div className="h-[180px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" aria-busy="true" />}
      <RunWeeksList weeks={weeks} />
      {paceTrend.length >= 2 && (
        <ChartCard title={t('hub.run.chart.pace.title')} hint={t('hub.run.chart.pace.hint')}>
          <LineChart data={paceTrend} color={HUB_COLORS.run.fill} formatValue={(v) => formatPace(paceOf(v))} ariaLabel={t('hub.run.chart.pace.aria')} />
        </ChartCard>
      )}
      <RunForecastCard rows={forecast.rows} trend={forecast.trend} />
      <RunZonesCard items={ladder} />
      <RecentActivityList kind="run" items={recent} now={now} />
    </>
  );
}

export default function RunHubPage() {
  const t = useT(profileNs);
  const running = useUserStore((s) => s.profile?.running);
  const hasPlan = useMemo(() => !!runningPlanProgress(running as Parameters<typeof runningPlanProgress>[0]), [running]);
  const { on } = useProgressHubFlag();
  const walkWeek = useWalkPlanWeek(on && !hasPlan);
  const walking = !hasPlan && !!walkWeek.data;
  const deciding = !hasPlan && walkWeek.loading;
  return (
    <HubPageShell
      kind={walking ? 'walk' : 'run'}
      title={walking ? t('hubV2.walk.page.title') : t('hubV2.run.page.title')}
      subtitle={walking ? t('hubV2.walk.page.subtitle') : t('hubV2.run.page.subtitle')}
    >
      {deciding ? <TabSkeleton /> : walking && walkWeek.data ? <WalkHubBody week={walkWeek.data} /> : <RunBody />}
    </HubPageShell>
  );
}
