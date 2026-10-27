'use client';

/**
 * Home "היום שלך" (board HomeToday, enable_schedule_tutorial_v1): today's cards scrolled sideways
 * (workout, steps ring, short optional session on a day without a workout), the flames counter
 * "N מתוך 2" and "להתאמן עכשיו" on a strength day that is not done yet. Data-only: the host
 * resolves the model (resolveHomeToday); the cards are the shared day-cards.
 */
import { Play } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import { FIRST_RUN_COACH } from '@/features/user/onboarding/services/first-run-tour';
import { DayCardsRow, OptionalSessionCard, StepsDayCard, WorkoutDayCard } from '@/features/schedule/day-cards';
import { FlameGlyph } from '@/features/schedule/tutorial-v1/components/FlameGlyphs';
import type { HomeTodayModel } from '../model/homeToday';
import { homeTodayView } from '../model/homeTodayView';

export interface HomeTodayCardsProps {
  model: HomeTodayModel;
  onTrainNow?: () => void;
}

export default function HomeTodayCards({ model, onTrainNow }: HomeTodayCardsProps) {
  const t = useT(schedule);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const v = homeTodayView(t, tc, locale, model);
  const showTrain = !!v.workout && !v.workout.done && !!onTrainNow;
  return (
    <section
      data-coach={FIRST_RUN_COACH.homeToday}
      aria-label={t('homeToday.title')}
      className="flex flex-col gap-2.5 rounded-[22px] bg-white py-3.5 ps-3.5 shadow-v2-card ring-1 ring-[rgba(14,27,42,0.06)]"
    >
      <div className="flex items-center gap-2 pe-3.5">
        <h2 className="text-[16px] font-black text-v2-ink">{t('homeToday.title')}</h2>
        <span className="text-[12.5px] font-bold text-v2-muted">{v.date}</span>
        <span
          role="img"
          aria-label={v.flamesAria}
          className="ms-auto flex items-center gap-1 rounded-full bg-[#fff1e6] px-2.5 py-[3px] text-[12px] font-black text-[#c2410c]"
        >
          <FlameGlyph size={16} />
          <span aria-hidden>{v.flames}</span>
        </span>
      </div>
      <DayCardsRow label={t('homeToday.title')}>
        {v.workout && <WorkoutDayCard card={v.workout} size="home" />}
        <div data-coach={FIRST_RUN_COACH.homeTodaySteps}>
          <StepsDayCard card={v.steps} size="home" />
        </div>
        {v.optional && <OptionalSessionCard card={v.optional} size="home" />}
      </DayCardsRow>
      {showTrain && (
        <button
          type="button"
          onClick={onTrainNow}
          data-coach={FIRST_RUN_COACH.homeTodayTrain}
          className="flex items-center gap-1.5 self-start rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] px-3 py-[5px] text-[13px] font-black text-[#04222b] transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Play size={12} fill="currentColor" strokeWidth={0} className="ltr:-scale-x-100" aria-hidden />
          {t('tutorial.week.trainNow')}
        </button>
      )}
      <p className="pe-3.5 text-[12.5px] leading-[18px] text-[#4b5a66]">{v.hint}</p>
    </section>
  );
}
