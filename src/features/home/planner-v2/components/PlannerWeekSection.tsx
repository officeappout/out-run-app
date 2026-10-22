'use client';

/**
 * The planner's week section (enable_week_builder_v1; board PL2-planner): "השבוע" with the
 * "שבוע N" pill and the "סידור השבוע" pill, the big "done / planned", the calm offer row
 * (#673, only while the current week has sessions that did not happen) and the day rows.
 */
import { ListOrdered } from 'lucide-react';
import CalmArrangeCard from '@/features/schedule/week-builder/planner/components/CalmArrangeCard';
import type { PlannerWbData } from '@/features/schedule/week-builder/planner/plannerWeek';
import type { PlannerWeekState } from '@/features/schedule/week-builder/planner/usePlannerWeek';
import { weekRangeHe } from '@/features/schedule/week-builder/planner/weekRange';
import type { WbSession } from '@/features/schedule/week-builder/types';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { weekProgress } from '../lib/weekSummary';
import PlannerWeekRows from './PlannerWeekRows';

export interface PlannerWeekSectionProps {
  userId: string;
  state: PlannerWeekState;
  isCurrentWeek: boolean;
  /** The running plan's week number for this week; null = none. */
  weekNumber: number | null;
  onArrange: () => void;
  onReplan: () => void;
  onSaved: () => void;
  onOpenDay?: (iso: string) => void;
  onOpenSession?: (session: WbSession<PlannerWbData>, iso: string) => void;
}

export default function PlannerWeekSection(p: PlannerWeekSectionProps) {
  const t = useT(home);
  const range = weekRangeHe(p.state.keys);
  const model = p.state.status === 'ready' ? p.state.model : null;
  const progress = model ? weekProgress(model.week) : null;
  return (
    <section dir="rtl" aria-label={p.isCurrentWeek ? t('plannerV2.week.this') : t('plannerV2.week.other', { range })}>
      <div className="flex items-end justify-between gap-2.5 px-5 pb-2.5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="whitespace-nowrap text-[20px] font-black leading-[26px] text-v2-ink">
              {p.isCurrentWeek ? t('plannerV2.week.this') : t('plannerV2.week.other', { range })}
            </h3>
            {p.weekNumber != null && (
              <span className="whitespace-nowrap rounded-full bg-v2-tint px-2.5 py-0.5 text-[12px] font-extrabold text-v2-deep">
                {t('plannerV2.week.number', { n: `${p.weekNumber}` })}
              </span>
            )}
            <button
              type="button"
              onClick={p.onArrange}
              disabled={!model}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[13px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-50"
            >
              <ListOrdered size={14} strokeWidth={2.6} className="text-v2-accent" aria-hidden />
              {t('plannerV2.week.arrange')}
            </button>
          </div>
          {p.isCurrentWeek && <p className="mt-0.5 text-[13px] font-bold text-v2-muted">{range}</p>}
        </div>
        {progress && progress.total > 0 && (
          <p className="shrink-0 whitespace-nowrap" aria-label={t('plannerV2.week.progressAria', { done: `${progress.done}`, total: `${progress.total}` })}>
            <span aria-hidden className="text-[32px] font-black leading-[34px] tabular-nums text-v2-deep">{progress.done}</span>
            <span aria-hidden className="text-[15px] font-bold text-v2-muted"> {t('plannerV2.week.ofTotal', { total: `${progress.total}` })}</span>
          </p>
        )}
      </div>

      {model && p.isCurrentWeek && (
        <div className="-mt-1 mb-3">
          <CalmArrangeCard show={model.missedCount > 0} onArrange={p.onReplan} />
        </div>
      )}

      {model ? (
        <PlannerWeekRows
          userId={p.userId}
          model={model}
          keys={p.state.keys}
          todayKey={p.state.todayKey}
          onSaved={p.onSaved}
          onOpenDay={p.onOpenDay}
          onOpenSession={p.onOpenSession}
        />
      ) : (
        <p role="status" className="mx-4 rounded-[24px] bg-white px-4 py-6 text-center text-[14px] font-bold text-v2-muted shadow-v2-card">
          {p.state.status === 'error' ? t('plannerV2.error') : t('plannerV2.loading')}
        </p>
      )}
    </section>
  );
}
