'use client';

/**
 * /progress/steps — the hub's steps page (PG-5, orange). Same data as
 * /activity/steps (useStepsAnalytics: one ≤ 365-doc read, live refresh on a
 * new health sample) and the same health-permission flow, laid out as:
 *   day · week · month · year → ring hero (+ day picker) → tiles → chart with
 *   the goal line → the last 30 days → the year's monthly averages → source.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, SegmentedPicker } from '@/components/ui/v2';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import { useStepsAnalytics, type StepsTimeRange } from '@/features/activity/hooks/useStepsAnalytics';
import { useHealthConnected } from '@/hooks/useHealthConnected';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { healthBridgeSyncNow } from '@/lib/healthBridge/init';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import HubPageShell from '../components/HubPageShell';
import { lastNDays, monthlyAverages, stepsHero, stepsTiles, trimLeadingEmpty } from './steps-hub.model';
import StepsHeroCard from './StepsHeroCard';
import StepsTilesGrid from './StepsTilesGrid';
import StepsChartCard from './StepsChartCard';
import StepsLast30Card from './StepsLast30Card';
import StepsYearCard from './StepsYearCard';
import StepsSourceCard from './StepsSourceCard';

const RANGES = [
  { key: 'day', labelKey: 'steps.range.day' },
  { key: 'week', labelKey: 'steps.range.week' },
  { key: 'month', labelKey: 'steps.range.month' },
  { key: 'year', labelKey: 'steps.range.year' },
] as const;

function StepsBody() {
  const t = useT(profileNs);
  const [range, setRange] = useState<StepsTimeRange>('week');
  const [dayOffset, setDayOffset] = useState(0);
  const options = useMemo(() => RANGES.map((r) => ({ key: r.key, label: t(r.labelKey) })), [t]);
  const { snapshots, chartData, stats, loading, error } = useStepsAnalytics(range);

  const healthKnown = useHealthConnected();
  const [granted, setGranted] = useState(false);
  const connected = granted ? true : healthKnown;
  const onGranted = useCallback(() => {
    setGranted(true);
    void healthBridgeSyncNow('manual');
  }, []);
  const { openDisclosure, disclosureProps } = useHealthWithDisclosure({ onGranted });

  useEffect(() => {
    if (range !== 'day') setDayOffset(0);
  }, [range]);

  const now = useMemo(() => new Date(), []);
  const hero = useMemo(() => stepsHero(snapshots, range, dayOffset, stats.dailyGoal || DAILY_STEP_GOAL), [snapshots, range, dayOffset, stats.dailyGoal]);
  const tiles = useMemo(() => stepsTiles(snapshots, range), [snapshots, range]);
  const last30 = useMemo(() => lastNDays(snapshots, now, 30), [snapshots, now]);
  const months = useMemo(() => trimLeadingEmpty(monthlyAverages(snapshots, now)), [snapshots, now]);
  const noData = !loading && snapshots.every((s) => s.steps === 0);

  return (
    <>
      <SegmentedPicker options={options} value={range} onChange={setRange} ariaLabel={t('steps.range.label')} />
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-[220px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
          <div className="h-[180px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
        </div>
      ) : error ? (
        <Card padding="none" className="px-5 py-7 text-center">
          <p className="text-[15px] font-black text-v2-ink">{t('steps.error.title')}</p>
          <p className="mt-1 text-[13px] font-semibold text-v2-muted">{t('steps.error.retry')}</p>
        </Card>
      ) : noData ? (
        <Card padding="none" className="px-5 py-7 text-center" data-steps-empty>
          <p className="text-[15px] font-black text-v2-ink">{t('steps.connect.prompt')}</p>
        </Card>
      ) : (
        <>
          <StepsHeroCard hero={hero} isDay={range === 'day'} dayOffset={dayOffset} snapshots={snapshots} onPickDay={setDayOffset} />
          <StepsTilesGrid tiles={tiles} range={range} />
          <StepsChartCard range={range} chartData={chartData} snapshots={snapshots} dayOffset={dayOffset} goal={stats.dailyGoal} />
          <StepsLast30Card cells={last30} />
          <StepsYearCard months={months} goal={stats.dailyGoal} />
        </>
      )}
      <StepsSourceCard connected={connected} onConnect={openDisclosure} />
      <HealthConnectDisclosureModal {...disclosureProps} />
    </>
  );
}

export default function StepsHubPage() {
  const t = useT(profileNs);
  return (
    <HubPageShell kind="steps" title={t('steps.header.title')} subtitle={t('steps.header.eyebrow')}>
      <StepsBody />
    </HubPageShell>
  );
}
