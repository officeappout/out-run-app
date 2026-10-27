'use client';

/**
 * ל4 / ל4ב "השבוע שלך מוכן!" (boards WeekPlan / WeekPlanPro): the hero (Kelly + minutes ring + chips),
 * the days as rows of cards, the cards hint, "אישור השבוע" (saves) and "לשנות" (back to the days).
 */
import { Info } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { useLocaleStore } from '@/store/useLocaleStore';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { chipIcon, chipLabel, programsList } from '../model/weekCards';
import { strengthLabelKey, type TutorialWeek } from '../model/tutorialWeek';
import WeekHero from './WeekHero';
import WeekDayRows from './WeekDayRows';

export interface WeekPlanStepProps {
  week: TutorialWeek;
  dates: readonly number[];
  todayDow: number;
  stepsToday: number;
  saving: boolean;
  error: boolean;
  onConfirm: () => void;
  onTrainNow: () => void;
  onChange: () => void;
}

export default function WeekPlanStep(p: WeekPlanStepProps) {
  const t = useT(schedule);
  const locale = useLocaleStore((s) => s.locale);
  const { week } = p;
  const total = week.minutes.strength + week.minutes.run + week.minutes.walk;
  const summary = week.complex
    ? t('tutorial.week.summary.complex', { programs: programsList(t, week, locale) })
    : t('tutorial.week.summary.simple', { strength: week.strengthCount, movement: week.movementCount });
  const chips = week.chips.map((c) => ({
    key: c.type === 'group' ? c.group : c.type === 'run' ? 'run' : strengthLabelKey(c.label),
    label: chipLabel(t, c),
    count: t('tutorial.week.chipCount', { n: c.count }),
    iconSrc: chipIcon(c),
  }));
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-3 bg-v2-surface px-4 pb-6 pt-4 font-simpler text-v2-ink">
      <WeekHero
        badge={t('tutorial.week.badge', { n: 1 })}
        title={t('tutorial.week.title')}
        kellyAlt={t('tutorial.week.kellyAlt')}
        minutes={week.minutes}
        totalLabel={formatNumber(total, locale)}
        ringUnit={t('tutorial.week.ringUnit')}
        ringAria={t('tutorial.week.ringAria', { total })}
        legend={{
          strength: t('tutorial.week.ring.strength', { n: week.minutes.strength }),
          run: t('tutorial.week.ring.run', { n: week.minutes.run }),
          walk: t('tutorial.week.ring.walk', { n: week.minutes.walk }),
        }}
        summary={summary}
        chips={chips}
      />
      <WeekDayRows week={week} dates={p.dates} todayDow={p.todayDow} stepsToday={p.stepsToday} onTrainNow={p.saving ? undefined : p.onTrainNow} />
      <p className="flex items-start gap-2 px-1 text-[12.5px] font-bold leading-[18px] text-v2-muted">
        <Info size={15} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden />
        {t('tutorial.week.cardsHint')}
      </p>
      {p.error && <p role="alert" className="px-1 text-[13px] font-bold text-[#b91c1c]">{t('tutorial.week.saveError')}</p>}
      <div className="flex-1" />
      <button
        type="button"
        onClick={p.onConfirm}
        disabled={p.saving}
        className="h-[52px] rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] text-[16px] font-black text-[#04222b] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_26px_-12px_rgba(0,186,247,0.7)] transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
      >
        {t('tutorial.week.confirm')}
      </button>
      <button type="button" onClick={p.onChange} disabled={p.saving} className="h-10 text-[14px] font-extrabold text-v2-ink-2">
        {t('tutorial.week.change')}
      </button>
    </div>
  );
}
