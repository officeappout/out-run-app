'use client';

/** P-5 — best set in range vs goal, range + metric pickers, the v2 LineChart with the goal line, 3 numbers. */
import { useMemo } from 'react';
import { Card, DeltaBadge, LineChart, SegmentedPicker } from '@/components/ui/v2';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';
import { chartData, trendStats, type ExerciseMetric, type ExerciseRange } from './exercise-analytics.utils';
import { useT } from '@/hooks/useT';
import { profile } from '@/messages/ns/profile';

// Keys, translated at render (docs/i18n/HOW-TO.md §3).
const RANGES = [
  { key: '1m', labelKey: 'exerciseAnalytics.trend.range.month' },
  { key: '3m', labelKey: 'exerciseAnalytics.trend.range.threeMonths' },
  { key: 'all', labelKey: 'exerciseAnalytics.trend.range.all' },
] as const;
const METRICS = [
  { key: 'maxReps', labelKey: 'exerciseAnalytics.trend.metric.maxReps' },
  { key: 'totalVolume', labelKey: 'exerciseAnalytics.trend.metric.totalVolume' },
] as const;

export interface ExerciseTrendCardV2Props {
  sessions: RichExerciseSession[];
  range: ExerciseRange;
  metric: ExerciseMetric;
  goal: number | null;
  onRange: (r: ExerciseRange) => void;
  onMetric: (m: ExerciseMetric) => void;
}

export default function ExerciseTrendCardV2({ sessions, range, metric, goal, onRange, onMetric }: ExerciseTrendCardV2Props) {
  const t = useT(profile);
  const rangeOptions = useMemo(() => RANGES.map((o) => ({ key: o.key, label: t(o.labelKey) })), [t]);
  const metricOptions = useMemo(() => METRICS.map((o) => ({ key: o.key, label: t(o.labelKey) })), [t]);
  const stats = useMemo(() => trendStats(sessions), [sessions]);
  const data = useMemo(() => chartData(sessions, metric), [sessions, metric]);
  const toGoal = goal != null ? goal - stats.best : null;
  const first = sessions[0]?.maxReps ?? 0;
  const last = sessions[sessions.length - 1]?.maxReps ?? 0;

  return (
    <Card padding="none" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{t('exerciseAnalytics.trend.title', { range })}</span>
        {sessions.length >= 2 && <DeltaBadge current={last} previous={first} suffix={t('exerciseAnalytics.trend.deltaSuffix')} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[40px] font-black leading-none !tracking-[-0.03em] tabular-nums text-v2-ink">{stats.best}</span>
        <span className="text-[14px] font-bold text-v2-muted">{t('exerciseAnalytics.trend.unitReps')}</span>
        {toGoal != null && toGoal > 0 && <span className="ms-2 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{t('exerciseAnalytics.trend.toGoal', { count: String(toGoal) })}</span>}
        {toGoal != null && toGoal <= 0 && <span className="ms-2 whitespace-nowrap text-[13px] font-extrabold text-[#00845a]">{t('exerciseAnalytics.trend.goalReached')}</span>}
      </div>

      <SegmentedPicker className="mt-3" options={rangeOptions} value={range} onChange={onRange} ariaLabel={t('exerciseAnalytics.trend.range.label')} />
      <SegmentedPicker className="mt-2" options={metricOptions} value={metric} onChange={onMetric} ariaLabel={t('exerciseAnalytics.trend.metric.label')} />

      <div className="mt-3">
        {data.length > 0 ? (
          <LineChart
            data={data}
            goal={metric === 'maxReps' ? goal : null}
            goalLabel={goal != null ? t('exerciseAnalytics.trend.goalLine', { goal: String(goal) }) : undefined}
            ariaLabel={t('exerciseAnalytics.trend.chartLabel')}
          />
        ) : (
          <p className="py-8 text-center text-[13px] font-bold text-v2-muted">{t('exerciseAnalytics.trend.noSessions')}</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-v2-hairline pt-3 text-center">
        {[
          { id: 'sessions', v: String(stats.sessions), l: t('exerciseAnalytics.trend.stat.sessions') },
          // wave 3 (fmt): the total is still pre-formatted here.
          { id: 'totalReps', v: stats.totalReps.toLocaleString('he-IL'), l: t('exerciseAnalytics.trend.stat.totalReps') },
          { id: 'perWeek', v: String(stats.perWeek), l: t('exerciseAnalytics.trend.stat.perWeek') },
        ].map((s) => (
          <div key={s.id}>
            <p className="text-[20px] font-black tabular-nums text-v2-ink">{s.v}</p>
            <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{s.l}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
