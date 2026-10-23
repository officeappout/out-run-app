'use client';

/**
 * Running card (PG-2) — green, or its walking variant (orange) when the plan is
 * a walking plan:
 *   running plan → ring = sessions done of the plan, the forecast for the plan's
 *                  distance ("forecast 5 km · 31:20"), "week N of M", and the
 *                  forecast's 30-day trend when the pace history has one;
 *   walking plan → no running plan + walks planned this week: ring = this
 *                  week's walks done of planned, the period's walking km;
 *   neither      → the period's running km and runs, plus the forecast when
 *                  the user has a base pace.
 * Tap → /progress/run (the page shows the same variant).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { formatRaceClock, selectRacePrediction } from '@/features/home/utils/race-prediction';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { KindTotals, ProgressPeriod } from '../../utils/progress-period';
import { runningPlanProgress } from '../../utils/running-plan-progress';
import { formatKm } from '../../utils/progress-format';
import { runPlanPct } from '../model/domain-cards.model';
import { usePlanName } from '../model/usePlanName';
import { useWalkPlanWeek } from '../model/useWalkPlanWeek';
import { HUB_ROUTES } from '../hub-routes';
import DomainCard from '../components/DomainCard';

type RunningLike = Parameters<typeof runningPlanProgress>[0] & {
  paceProfile?: { basePace?: number; qualityWorkoutsHistory?: { date?: unknown; impactOnBasePaceSeconds?: unknown }[] } | null;
};

export default function RunDomainCard({ period, run, walk }: { period: ProgressPeriod; run: KindTotals; walk: KindTotals }) {
  const t = useT(profileNs);
  const router = useRouter();
  const running = useUserStore((s) => s.profile?.running) as RunningLike | undefined;
  const plan = useMemo(() => runningPlanProgress(running), [running]);
  const walkWeek = useWalkPlanWeek(!plan);
  const now = useMemo(() => new Date(), []);
  const prediction = useMemo(
    () =>
      selectRacePrediction({
        basePace: running?.paceProfile?.basePace ?? null,
        targetDistance: running?.generatedProgramTemplate?.targetDistance,
        history: running?.paceProfile?.qualityWorkoutsHistory ?? null,
        isRunner: true,
        runningProgramsEnabled: false,
        now,
      }),
    [running, now],
  );
  const planName = usePlanName(plan?.distKey ?? null, plan?.title ?? '');
  const n = (v: number) => formatNumber(v, t.locale);
  const open = () => router.push(HUB_ROUTES.run);

  const forecast =
    prediction.state === 'ready'
      ? t('hubV2.run.card.forecast', { distance: prediction.main.label, time: formatRaceClock(prediction.main.seconds) })
      : null;
  const trend =
    prediction.state === 'ready' && prediction.trendSeconds != null
      ? t('hubV2.run.card.trend', { faster: prediction.trendSeconds < 0 ? 'yes' : 'no', clock: formatRaceClock(Math.abs(prediction.trendSeconds)) })
      : null;

  // Walking variant: no running plan, walks planned this week.
  if (!plan && walkWeek.data) {
    const w = walkWeek.data;
    return (
      <DomainCard
        kind="walk"
        title={t('hubV2.walk.card.title')}
        pct={w.pct}
        ringLabel={t('hubV2.card.ringAria', { pct: n(w.pct) })}
        lines={[
          t('hubV2.walk.card.week', { done: n(w.done), planned: n(w.planned) }),
          t('hubV2.walk.card.period', { period, km: formatKm(walk.km, t.locale), count: walk.count }),
        ]}
        onOpen={open}
        ariaLabel={t('hubV2.card.open', { name: t('hubV2.walk.card.title') })}
        locale={t.locale}
      />
    );
  }

  const periodLine = t('hubV2.run.card.period', { period, km: formatKm(run.km, t.locale), count: run.count });
  const pct = runPlanPct(plan);
  const lines = plan
    ? [planName, ...(forecast ? [forecast] : []), t('hubV2.run.card.week', { week: n(plan.currentWeek), weeks: n(plan.weeks) })]
    : [periodLine, ...(forecast ? [forecast] : [t('hubV2.run.card.noPlan')])];
  return (
    <DomainCard
      kind="run"
      title={plan ? t('hubV2.run.card.planTitle') : t('hubV2.run.card.title')}
      pct={pct}
      ringLabel={pct != null ? t('hubV2.card.ringAria', { pct: n(pct) }) : undefined}
      lines={lines}
      accent={trend}
      onOpen={open}
      ariaLabel={t('hubV2.card.open', { name: t('hubV2.run.card.title') })}
      locale={t.locale}
    />
  );
}
