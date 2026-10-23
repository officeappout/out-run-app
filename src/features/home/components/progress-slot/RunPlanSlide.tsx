'use client';

/**
 * Home progress slot — the running plan card (boards PG-1, slot 2; running stays green):
 * ring = completed sessions of the whole plan; "תחזית 5 ק״מ 31:20" from the real
 * paceProfile.basePace (selectRacePrediction — the model of the old 'תחזית למרוץ' card);
 * "שבוע N מתוך M"; the 30-day trend when the pace history has one. No basePace yet →
 * the plan's sessions count instead of a forecast. Tap → the running deeper page.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { PROGRESS_COLORS } from '@/features/progression-hub/v2/utils/progress-model';
import type { RunningPlanProgress } from '@/features/progression-hub/v2/utils/running-plan-progress';
import { formatDistanceLabel, formatRaceClock, selectRacePrediction } from '@/features/home/utils/race-prediction';
import { PROGRESS_RUN_HREF } from '@/features/home/utils/progress-slot';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { common } from '@/messages/ns/common';
import PlanProgressCard from './PlanProgressCard';

export default function RunPlanSlide({ plan, pct }: { plan: RunningPlanProgress; pct: number }) {
  const t = useT(home);
  const tc = useT(common);
  const router = useRouter();
  const running = useUserStore((s) => s.profile?.running);
  const basePace = running?.paceProfile?.basePace;
  const history = running?.paceProfile?.qualityWorkoutsHistory;

  const view = useMemo(
    () =>
      selectRacePrediction({
        basePace,
        targetDistance: plan.distKey,
        history: history as unknown as { date?: unknown; impactOnBasePaceSeconds?: unknown }[] | undefined,
        isRunner: true,
        runningProgramsEnabled: false,
        now: new Date(),
      }),
    [basePace, history, plan.distKey],
  );

  const n = (v: number) => formatNumber(v, t.locale);
  const pctText = formatNumber(pct / 100, t.locale, { style: 'percent', maximumFractionDigits: 0 });
  const week = t('progressSlot.run.week', { week: n(plan.currentWeek), weeks: n(plan.weeks) });
  const ready = view.state === 'ready' ? view : null;

  return (
    <PlanProgressCard
      kind="run"
      color={PROGRESS_COLORS.run}
      textColor={PROGRESS_COLORS.runText}
      pct={pct}
      ringText={pctText}
      ringLabel={t('progressSlot.run.ringLabel', { pct: pctText })}
      kicker={ready ? t('progressSlot.run.forecast', { dist: formatDistanceLabel(ready.main.km, tc) }) : t('progressSlot.run.kicker')}
      value={
        ready ? (
          <bdi dir="ltr">{formatRaceClock(ready.main.seconds)}</bdi>
        ) : (
          t('progressSlot.run.sessions', { done: n(plan.done), total: n(plan.total) })
        )
      }
      line={week}
      footnote={
        ready && ready.trendSeconds !== null
          ? {
              text: t('progressSlot.run.trend', {
                direction: ready.trendSeconds < 0 ? 'faster' : 'slower',
                clock: formatRaceClock(Math.abs(ready.trendSeconds)),
              }),
              positive: ready.trendSeconds < 0,
            }
          : null
      }
      onClick={() => router.push(PROGRESS_RUN_HREF)}
    />
  );
}
