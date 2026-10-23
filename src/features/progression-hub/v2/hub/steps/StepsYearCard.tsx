'use client';

/** The year (PG-5): the daily average of each of the last 12 months, the current month highlighted. */
import { BarChart, Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { monthShort } from '../../utils/progress-format';
import { HUB_COLORS } from '../hub-colors';
import type { MonthAverage } from './steps-hub.model';

export default function StepsYearCard({ months, goal }: { months: readonly MonthAverage[]; goal: number }) {
  const t = useT(profileNs);
  if (months.length < 2) return null;
  const current = months[months.length - 1];
  return (
    <Card padding="none" className="px-4 py-3.5" data-steps-year>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.steps.year.title')}</h3>
        <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('hubV2.steps.year.hint')}</span>
      </div>
      <BarChart
        data={months.map((m) => ({ key: m.key, label: monthShort(m.month, t.locale), value: m.average }))}
        goal={goal > 0 ? goal : null}
        highlightKey={current.key}
        color={HUB_COLORS.steps.fill}
        dir="ltr"
        height={170}
        labelEvery={months.length > 8 ? 2 : 1}
        datasetKey="year-avg"
        renderTooltip={(d) => (
          <div className="text-center">
            <div className="text-[18px] font-black leading-tight tabular-nums text-v2-ink" dir="ltr">{formatNumber(d.value, t.locale)}</div>
            <div className="text-[10px] font-bold leading-tight text-v2-muted">{t('hubV2.steps.year.unit')}</div>
          </div>
        )}
        ariaLabel={t('hubV2.steps.year.title')}
      />
    </Card>
  );
}
