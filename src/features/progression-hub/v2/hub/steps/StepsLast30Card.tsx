'use client';

/** The last 30 days at a glance (PG-5): one cell per day — in goal / below goal / no data. */
import { Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { formatDateLoose } from '@/lib/i18n/fmt-display';
import { HUB_COLORS } from '../hub-colors';
import type { DayCell } from './steps-hub.model';

const ORANGE = HUB_COLORS.steps;

function cellStyle(met: boolean | null) {
  if (met === true) return { background: ORANGE.fill };
  if (met === false) return { background: ORANGE.tile, boxShadow: `inset 0 0 0 1.5px ${ORANGE.fill}55` };
  return undefined;
}

export default function StepsLast30Card({ cells }: { cells: readonly DayCell[] }) {
  const t = useT(profileNs);
  const inGoal = cells.filter((c) => c.met === true).length;
  return (
    <Card padding="none" className="px-4 py-3.5" data-steps-last30>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.steps.last30.title')}</h3>
        <span className="whitespace-nowrap text-[12px] font-extrabold" style={{ color: ORANGE.text }}>
          {t('hubV2.steps.last30.inGoal', { count: inGoal })}
        </span>
      </div>
      {/* Time runs left → right, like the charts. */}
      <ol className="grid grid-cols-10 gap-1.5" dir="ltr">
        {cells.map((c) => (
          <li
            key={c.date}
            className={`aspect-square rounded-[6px] ${c.met == null ? 'bg-v2-hairline' : ''}`}
            style={cellStyle(c.met)}
            aria-label={t('hubV2.steps.last30.cellAria', {
              date: formatDateLoose(new Date(c.date + 'T00:00:00'), t.locale, { day: 'numeric', month: 'numeric' }),
              steps: formatNumber(c.steps, t.locale),
              state: c.met == null ? 'none' : c.met ? 'met' : 'below',
            })}
          />
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-4 text-[11.5px] font-bold text-v2-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={cellStyle(true)} aria-hidden />
          {t('hubV2.steps.last30.legendMet')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={cellStyle(false)} aria-hidden />
          {t('hubV2.steps.last30.legendBelow')}
        </span>
      </div>
    </Card>
  );
}
