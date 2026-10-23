'use client';

/**
 * Running page hero (PG-3): the plan ring (sessions done of the plan), its
 * name and length, "week N of M", "X of Y sessions done · until <date>", an
 * on-track chip, and three numbers since the plan started.
 */
import { Card } from '@/components/ui/v2';
import MiniRing from '@/components/ui/v2/MiniRing';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { formatDateLoose } from '@/lib/i18n/fmt-display';
import type { RunningPlanProgress } from '../../utils/running-plan-progress';
import { formatHours, formatKm } from '../../utils/progress-format';
import { HUB_COLORS } from '../hub-colors';
import { runPlanPct } from '../model/domain-cards.model';
import type { PlanTotals } from './run-page.model';

const GREEN = HUB_COLORS.run;

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-[18px] font-black tabular-nums text-v2-ink">
        <span dir="ltr">{value}</span>
        {unit && <span className="ms-0.5 text-[11.5px] font-bold text-v2-muted">{unit}</span>}
      </p>
      <p className="truncate text-[11.5px] font-bold text-v2-muted">{label}</p>
    </div>
  );
}

export default function RunPlanHero({ plan, planName, totals }: { plan: RunningPlanProgress; planName: string; totals: PlanTotals | null }) {
  const t = useT(profileNs);
  const n = (v: number) => formatNumber(v, t.locale);
  const pct = runPlanPct(plan) ?? 0;
  return (
    <Card padding="none" className="p-4" data-run-hero>
      <div className="flex items-center gap-4">
        <MiniRing pct={pct} color={GREEN.fill} size={104} stroke={11} label={t('hubV2.card.ringAria', { pct: n(pct) })}>
          <span className="relative text-[24px] font-black tabular-nums text-v2-ink" dir="ltr">
            {n(pct)}
            <span className="text-[13px] font-extrabold">%</span>
          </span>
        </MiniRing>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[16px] font-black text-v2-ink">{t('hubV2.run.hero.title', { plan: planName, weeks: plan.weeks })}</p>
          <p className="text-[14px] font-extrabold" style={{ color: GREEN.text }}>
            {t('hubV2.run.card.week', { week: n(plan.currentWeek), weeks: n(plan.weeks) })}
          </p>
          <p className="text-[12.5px] font-bold text-v2-muted">
            {totals
              ? t('hubV2.run.hero.doneUntil', {
                  done: n(plan.done),
                  total: n(plan.total),
                  date: formatDateLoose(totals.endDate, t.locale, { day: 'numeric', month: 'numeric' }),
                })
              : t('hubV2.run.hero.done', { done: n(plan.done), total: n(plan.total) })}
          </p>
          {totals && (
            <span
              className="mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold"
              style={totals.onTrack ? { background: GREEN.tile, color: GREEN.text } : { background: 'rgba(14,27,42,0.06)', color: '#4b5a66' }}
            >
              {t('hubV2.run.hero.track', { state: totals.onTrack ? 'on' : 'behind' })}
            </span>
          )}
        </div>
      </div>
      {totals && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-v2-hairline pt-3">
          <Stat value={formatKm(totals.km, t.locale)} unit={t('hub.summary.stat.kmUnit')} label={t('hubV2.run.hero.totalKm')} />
          <Stat value={formatHours(totals.minutes)} unit={t('hubV2.run.hero.hoursUnit')} label={t('hubV2.run.hero.time')} />
          <Stat value={n(plan.frequency)} label={t('hubV2.run.hero.perWeek')} />
        </div>
      )}
    </Card>
  );
}
