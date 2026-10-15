'use client';

/**
 * Design-v2 preview for the Steps screen (dev only).
 *
 *   ?range=day|week|month|year   page tab (default week)
 *   ?state=empty|error|loading|gate   page state (gate = native, no permission)
 *   ?view=widgets                the home steps widgets with fixtures
 */

import React, { useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  deriveStepsChartData,
  deriveStepsStats,
  type StepsTimeRange,
} from '@/features/activity/lib/steps-analytics.logic';
import { StepsWidget } from '@/features/home/components/widgets/StepsWidget';
import StepsSummaryCardView from '@/features/home/components/widgets/StepsSummaryCardView';
import { makeStepsFixtures } from './fixtures';

const StepsAnalyticsView = dynamicImport(
  () => import('@/features/activity/components/StepsAnalyticsView'),
  { ssr: false },
);

const RANGES: StepsTimeRange[] = ['day', 'week', 'month', 'year'];

function WidgetsPreview() {
  const noop = () => undefined;
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-[#F8FAFC] p-4 space-y-6">
      <section className="space-y-2">
        <p className="text-xs font-bold text-gray-500">StepsSummaryCard — default</p>
        <StepsSummaryCardView
          variant="default"
          displaySteps={(6420).toLocaleString('he-IL')}
          goal={8000}
          percentage={80}
          connectPromptLabel={null}
          ariaLabel="פתח ניתוח צעדים"
          onOpen={noop}
        />
        <StepsSummaryCardView
          variant="default"
          displaySteps="—"
          goal={8000}
          percentage={0}
          connectPromptLabel="עוד לא חובר"
          ariaLabel="פתח ניתוח צעדים"
          onOpen={noop}
        />
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold text-gray-500">StepsSummaryCard — compact (home row)</p>
        <div className="grid grid-cols-2 gap-3 h-[170px]">
          <StepsSummaryCardView
            variant="compact"
            displaySteps={(9120).toLocaleString('he-IL')}
            goal={8000}
            percentage={100}
            connectPromptLabel={null}
            ariaLabel="פתח ניתוח צעדים"
            onOpen={noop}
          />
          <StepsSummaryCardView
            variant="compact"
            displaySteps={(3240).toLocaleString('he-IL')}
            goal={8000}
            percentage={41}
            connectPromptLabel={null}
            ariaLabel="פתח ניתוח צעדים"
            onOpen={noop}
          />
        </div>
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold text-gray-500">StepsWidget</p>
        <div className="grid grid-cols-2 gap-3">
          <StepsWidget steps={6420} goal={8000} />
          <StepsWidget steps={9120} goal={8000} />
        </div>
      </section>
    </div>
  );
}

export default function StepsPreview() {
  const params = useSearchParams();
  const view = params.get('view');
  const state = params.get('state');
  const initialRange = (RANGES as string[]).includes(params.get('range') ?? '')
    ? (params.get('range') as StepsTimeRange)
    : 'week';
  const [timeRange, setTimeRange] = useState<StepsTimeRange>(initialRange);

  const snapshots = useMemo(() => (state === 'empty' ? [] : makeStepsFixtures()), [state]);
  const chartData = useMemo(() => deriveStepsChartData(snapshots, timeRange), [snapshots, timeRange]);
  const stats = useMemo(() => deriveStepsStats(snapshots, timeRange), [snapshots, timeRange]);

  if (view === 'widgets') return <WidgetsPreview />;

  return (
    <StepsAnalyticsView
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      snapshots={snapshots}
      chartData={chartData}
      stats={stats}
      loading={state === 'loading'}
      error={state === 'error'}
      hasPermissions={state !== 'gate'}
      onConnect={() => undefined}
      onBack={() => undefined}
    />
  );
}
