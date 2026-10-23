'use client';

/**
 * Steps by day (with the daily goal line) for day / week / month, by month for
 * the year — the existing page's chart data (deriveStepsChartData), orange.
 * Day tab: the last 7 days with the picked day highlighted. Tap a bar for its value.
 */
import { BarChart, Card, type BarDatum } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import {
  bucketTooltipLabel,
  currentBucketKey,
  type StepsChartPoint,
  type StepsTimeRange,
} from '@/features/activity/lib/steps-analytics.logic';
import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { HUB_COLORS } from '../hub-colors';

export default function StepsChartCard({
  range,
  chartData,
  snapshots,
  dayOffset,
  goal,
}: {
  range: StepsTimeRange;
  chartData: readonly StepsChartPoint[];
  snapshots: readonly DailyStepsSnapshot[];
  dayOffset: number;
  goal: number;
}) {
  const t = useT(profileNs);
  const isDay = range === 'day';
  const isYear = range === 'year';
  const last7 = snapshots.slice(-7);
  const data: BarDatum[] = isDay
    ? last7.map((s) => {
        const d = new Date(s.date + 'T00:00:00');
        return { key: s.date, label: `${d.getDate()}/${d.getMonth() + 1}`, value: s.steps };
      })
    : chartData.map((d) => ({ key: d.key, label: d.label, value: d.value }));
  const highlight = isDay ? last7[last7.length - 1 - dayOffset]?.date ?? null : currentBucketKey(range);
  const showGoal = !isYear && goal > 0;
  const title = isDay ? t('steps.chart.last7Days') : isYear ? t('steps.chart.byMonth') : t('steps.chart.byDay');

  return (
    <Card padding="none" className="px-4 py-3.5" data-steps-chart={range}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</h3>
        {showGoal && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-bold text-v2-muted">
            <span className="w-4 border-t-[1.5px] border-dashed border-v2-ink/30" aria-hidden />
            {t('hubV2.steps.chart.goal', { goal: formatNumber(goal, t.locale) })}
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-[13px] font-bold text-v2-muted">{t('hubV2.steps.chart.empty')}</p>
      ) : (
        <BarChart
          data={data}
          goal={showGoal ? goal : null}
          highlightKey={highlight}
          color={HUB_COLORS.steps.fill}
          dir="ltr"
          height={200}
          labelEvery={isYear ? 2 : range === 'month' ? 5 : undefined}
          datasetKey={range}
          renderTooltip={(d) => (
            <div className="text-center">
              <div className="text-[18px] font-black leading-tight tabular-nums text-v2-ink" dir="ltr">{formatNumber(d.value, t.locale)}</div>
              <div className="text-[10px] font-bold leading-tight text-v2-muted">{t('steps.unit.steps')}</div>
              <div className="mt-0.5 text-[11px] font-semibold leading-tight text-v2-ink-2">{bucketTooltipLabel(d.key)}</div>
            </div>
          )}
          ariaLabel={title}
        />
      )}
      {data.length > 0 && <p className="mt-3 text-center text-[11px] font-semibold text-v2-muted">{t('steps.chart.tapHint')}</p>}
    </Card>
  );
}
