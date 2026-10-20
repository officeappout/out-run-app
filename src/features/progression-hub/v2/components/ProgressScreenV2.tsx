'use client';

/**
 * ProgressScreenV2 — the "התקדמות" bottom-nav tab under enable_home_v2
 * (boards runcanvas/pr P-1a…P-4). Everything about what the user DID lives
 * here; the profile keeps identity & social.
 *
 *   header → השבוע / החודש → summary vs the previous period (P-1)
 *   → active days (7-day strip / month calendar) → לפי פעילות tabs (P-2)
 *   → התוכניות שלך (P-4)
 *
 * Every block is its own WidgetBoundary; reads are bounded (see
 * hooks/useProgressData.ts) and one-shot.
 */
import { useMemo, useState } from 'react';
import AppHeader from '@/components/ui/AppHeader';
import { ErrorState, SegmentedPicker } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { usePeriodData } from '../hooks/useProgressData';
import { longestActiveRun, monthCells, summarizePeriod, weekCells, type ProgressPeriod } from '../utils/progress-period';
import PeriodSummaryCard from './PeriodSummaryCard';
import ActivityDaysCard from './ActivityDaysCard';
import ActivityTabs, { type ActivityTabKey } from './ActivityTabs';
import ProgramsBlock from './ProgramsBlock';

const PERIODS = [
  { key: 'week', label: 'השבוע' },
  { key: 'month', label: 'החודש' },
] as const;

function PeriodBlock({ period }: { period: ProgressPeriod }) {
  const { data, loading, error, ranges, now } = usePeriodData(period);
  const currentStreak = useUserStore((s) => s.profile?.progression?.currentStreak ?? 0);
  const model = useMemo(() => {
    if (!data) return null;
    const current = summarizePeriod(data.workouts, data.days, ranges.current);
    const previous = summarizePeriod(data.workouts, data.days, ranges.previous);
    if (period === 'week') return { current, previous, cells: weekCells(data.workouts, data.days, now), lead: 0 };
    const m = monthCells(data.workouts, data.days, now);
    return { current, previous, cells: m.cells, lead: m.lead };
  }, [data, ranges, period, now]);

  if (error) return <ErrorState variant="compact" title="לא הצלחנו לטעון את הסיכום" description="נסו שוב בעוד רגע." />;
  if (loading || !model) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-[260px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
        <div className="h-[96px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PeriodSummaryCard period={period} ranges={ranges} current={model.current} previous={model.previous} />
      <ActivityDaysCard
        period={period}
        cells={model.cells}
        lead={model.lead}
        currentStreak={currentStreak}
        bestRun={period === 'month' ? longestActiveRun(model.cells) : 0}
      />
    </div>
  );
}

export default function ProgressScreenV2() {
  const [period, setPeriod] = useState<ProgressPeriod>('week');
  const [tab, setTab] = useState<ActivityTabKey>('run');
  return (
    <div className="min-h-screen bg-v2-surface text-v2-ink" dir="rtl">
      <AppHeader v2 />
      <div className="mx-auto max-w-md space-y-5 px-4 pb-28 pt-4">
        <header>
          <h1 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">התקדמות</h1>
          <p className="text-[13px] font-bold text-v2-muted">מה עשית, איפה השתפרת, לאן ממשיכים</p>
          <SegmentedPicker className="mt-3" options={PERIODS} value={period} onChange={setPeriod} ariaLabel="תקופה" />
        </header>

        <WidgetBoundary name="progress.period" resetKeys={[period]}>
          <PeriodBlock period={period} />
        </WidgetBoundary>

        <ActivityTabs value={tab} onChange={setTab} />

        <WidgetBoundary name="progress.programs">
          <ProgramsBlock />
        </WidgetBoundary>
      </div>
    </div>
  );
}
