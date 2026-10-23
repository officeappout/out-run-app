'use client';

/**
 * ProgressHubScreen — the progress tab under enable_progress_hub_v2 (inside
 * enable_home_v2), owner-approved canvas page 12 (PG-2):
 *
 *   header → this week / this month → summary ring → by domain:
 *     strength · running (walking variant) · steps
 *
 * Each card opens its page inside progress (hub-routes.ts). Everything else the
 * v2 tab showed lives on those pages now (activity tabs → the pages, programs →
 * the strength page).
 */
import { useMemo, useState } from 'react';
import AppHeader from '@/components/ui/AppHeader';
import { SegmentedPicker } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import type { ProgressPeriod } from '../utils/progress-period';
import HubPeriodBlock from './HubPeriodBlock';

const PERIODS = [
  { key: 'week', labelKey: 'hub.screen.period.week' },
  { key: 'month', labelKey: 'hub.screen.period.month' },
] as const;

export default function ProgressHubScreen() {
  const t = useT(profileNs);
  const periods = useMemo(() => PERIODS.map((p) => ({ key: p.key, label: t(p.labelKey) })), [t]);
  const [period, setPeriod] = useState<ProgressPeriod>('week');
  return (
    <div className="min-h-screen bg-v2-surface text-v2-ink" data-progress-hub="v2">
      <AppHeader v2 />
      <div className="mx-auto max-w-md space-y-5 px-4 pb-28 pt-4">
        <header>
          <h1 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{t('hub.screen.title')}</h1>
          <p className="text-[13px] font-bold text-v2-muted">{t('hub.screen.subtitle')}</p>
          <SegmentedPicker className="mt-3" options={periods} value={period} onChange={setPeriod} ariaLabel={t('hub.screen.periodLabel')} />
        </header>

        <WidgetBoundary name="progressHub.period" resetKeys={[period]}>
          <HubPeriodBlock period={period} />
        </WidgetBoundary>
      </div>
    </div>
  );
}
