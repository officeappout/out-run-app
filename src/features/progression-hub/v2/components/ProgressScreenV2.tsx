'use client';

/**
 * ProgressScreenV2 — the "התקדמות" bottom-nav tab under enable_home_v2
 * (boards runcanvas/pr P-1a…P-7). Everything about what the user DID lives
 * here; the profile keeps identity & social.
 *
 *   header → השבוע / החודש → summary ring vs the previous period (P-1c);
 *     its "מול שבוע שעבר" pill / ring / ▲▼ open the comparison sheet (P-1e)
 *   → "שיא חדש" (→ profile records) → the home week strip / month calendar
 *   → התמדה: which days counted and why (P-7) → לפי פעילות tabs (P-2)
 *   → התוכניות שלך (P-4)
 *
 * Every block is its own WidgetBoundary; reads are bounded (see
 * hooks/useProgressData.ts) and one-shot.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import AppHeader from '@/components/ui/AppHeader';
import { ErrorState, SegmentedPicker } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { usePeriodData } from '../hooks/useProgressData';
import { longestActiveRun, monthCells, summarizePeriod, type ProgressPeriod } from '../utils/progress-period';
import { periodSpark, type SplitKind } from '../utils/period-spark';
import { consistencyDays } from '../utils/consistency-days';
import PeriodSummaryRingCard from './PeriodSummaryRingCard';
import PeriodCompareSheet from './PeriodCompareSheet';
import ActivityDaysCard from './ActivityDaysCard';
import ProgressWeekStrip from './ProgressWeekStrip';
import ConsistencyCard from './ConsistencyCard';
import NewRecordHighlight from './NewRecordHighlight';
import ActivityTabs, { type ActivityTabKey } from './ActivityTabs';
import ProgramsBlock from './ProgramsBlock';

const PERIODS = [
  { key: 'week', label: 'השבוע' },
  { key: 'month', label: 'החודש' },
] as const;

function useStreaks() {
  const profileStreak = useUserStore((s) => s.profile?.progression?.currentStreak ?? 0);
  const profileLongest = useUserStore((s) => Number(s.profile?.progression?.longestStreak) || 0);
  const storeStreak = useActivityStore((s) => s.currentStreak);
  const storeLongest = useActivityStore((s) => s.longestStreak);
  const current = storeStreak || profileStreak;
  return { current, longest: Math.max(profileLongest, Number(storeLongest) || 0, current) };
}

function PeriodBlock({ period, onSelectKind }: { period: ProgressPeriod; onSelectKind: (k: SplitKind) => void }) {
  const { data, loading, error, ranges, now } = usePeriodData(period);
  const streaks = useStreaks();
  const consistencyRef = useRef<HTMLDivElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const openCompare = useCallback(() => setCompareOpen(true), []);
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const model = useMemo(() => {
    if (!data) return null;
    const current = summarizePeriod(data.workouts, data.days, ranges.current);
    const previous = summarizePeriod(data.workouts, data.days, ranges.previous);
    const spark = periodSpark(period, ranges.current, data.workouts, data.days, now);
    // Week: the last 7 days (rolling — the week data reaches back into last week); month: the 1st → today.
    const from = period === 'week' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6) : ranges.current.start;
    const days = consistencyDays(data.workouts, data.days, from, now);
    const month = period === 'month' ? monthCells(data.workouts, data.days, now) : null;
    return { current, previous, spark, days, month };
  }, [data, ranges, period, now]);

  if (error) return <ErrorState variant="compact" title="לא הצלחנו לטעון את הסיכום" description="נסו שוב בעוד רגע." />;
  if (loading || !model) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-[250px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
        <div className="h-[96px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PeriodSummaryRingCard
        period={period}
        ranges={ranges}
        current={model.current}
        previous={model.previous}
        spark={model.spark}
        onSelectKind={onSelectKind}
        onOpenCompare={openCompare}
      />
      <WidgetBoundary name="progress.compare" fallback={() => null}>
        <PeriodCompareSheet
          open={compareOpen}
          onClose={closeCompare}
          period={period}
          ranges={ranges}
          current={model.current}
          previous={model.previous}
          now={now}
        />
      </WidgetBoundary>
      <WidgetBoundary name="progress.newRecord" fallback={() => null}>
        <NewRecordHighlight />
      </WidgetBoundary>
      {period === 'week' ? (
        <WidgetBoundary name="progress.weekStrip">
          <ProgressWeekStrip
            activeDays={model.current.activeDays}
            currentStreak={streaks.current}
            onOpenConsistency={() => consistencyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        </WidgetBoundary>
      ) : (
        model.month && <ActivityDaysCard cells={model.month.cells} lead={model.month.lead} bestRun={longestActiveRun(model.month.cells)} />
      )}
      <div ref={consistencyRef} className="scroll-mt-20">
        <WidgetBoundary name="progress.consistency" resetKeys={[period]}>
          <ConsistencyCard days={model.days} currentStreak={streaks.current} longestStreak={streaks.longest} />
        </WidgetBoundary>
      </div>
    </div>
  );
}

export default function ProgressScreenV2() {
  const [period, setPeriod] = useState<ProgressPeriod>('week');
  const [tab, setTab] = useState<ActivityTabKey>('run');
  const tabsRef = useRef<HTMLDivElement>(null);
  const openKind = useCallback((k: SplitKind) => {
    setTab(k);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
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
          <PeriodBlock period={period} onSelectKind={openKind} />
        </WidgetBoundary>

        <div ref={tabsRef} className="scroll-mt-20">
          <ActivityTabs value={tab} onChange={setTab} />
        </div>

        <WidgetBoundary name="progress.programs">
          <ProgramsBlock />
        </WidgetBoundary>
      </div>
    </div>
  );
}
