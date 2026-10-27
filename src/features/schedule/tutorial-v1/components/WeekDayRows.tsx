'use client';

/**
 * The days of ל4 (boards WeekPlan / WeekPlanPro): one row per day (rest days in a row merged, "ו׳–ש׳"),
 * the date on the start side, then the day's cards scrolled sideways (shared day-cards). Today's date
 * is the brand circle; a strength day today gets "להתאמן עכשיו". No "why" line under days (C8).
 */
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import { weekdayLabel } from '@/lib/i18n/units';
import { DayCardsRow, OptionalSessionCard, StepsDayCard, WorkoutDayCard } from '@/features/schedule/day-cards';
import { dayCardsView, groupRestDays } from '../model/weekCards';
import type { TutorialWeek } from '../model/tutorialWeek';

export interface WeekDayRowsProps {
  week: TutorialWeek;
  dates: readonly number[];
  todayDow: number;
  stepsToday: number;
}

export default function WeekDayRows({ week, dates, todayDow, stepsToday }: WeekDayRowsProps) {
  const t = useT(schedule);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const groups = groupRestDays(week.days);
  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-v2-card ring-1 ring-v2-accent/40">
      {groups.map((group, i) => {
        const day = group[0];
        const isToday = day.dow === todayDow;
        const range = group.length > 1;
        const dayLabel = range
          ? t('tutorial.week.dayRange', { from: weekdayLabel(day.dow, 'short', tc), to: weekdayLabel(group[group.length - 1].dow, 'short', tc) })
          : weekdayLabel(day.dow, 'short', tc);
        const view = dayCardsView(t, tc, locale, day, { isToday, stepsToday });
        const restSubtitle = !day.free && !day.strength && !day.runs.length && !view.steps.subtitle ? t('tutorial.week.noWorkout') : undefined;
        return (
          <div key={day.dow} className={`flex min-h-[64px] items-center gap-2.5 py-2.5 ps-3 ${i > 0 ? 'border-t border-v2-hairline' : ''}`}>
            <div className="w-10 shrink-0 text-center">
              <span className={`block whitespace-nowrap text-[12px] font-extrabold ${isToday ? 'text-v2-deep' : 'text-v2-muted'}`}>{dayLabel}</span>
              {!range && (
                <span
                  className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-[16px] font-black tabular-nums ${
                    isToday ? 'bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] text-[#04222b]' : 'text-v2-ink'
                  }`}
                >
                  {dates[day.dow]}
                </span>
              )}
            </div>
            <span aria-hidden className="h-9 w-px shrink-0 bg-v2-hairline" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <DayCardsRow label={t('dayCards.rowAria', { day: weekdayLabel(day.dow, 'long', tc) })}>
                {view.workouts.map((w, k) => <WorkoutDayCard key={`w${k}`} card={w} />)}
                <StepsDayCard card={{ ...view.steps, subtitle: view.steps.subtitle ?? restSubtitle }} />
                {view.optional.map((o, k) => <OptionalSessionCard key={`o${k}`} card={o} />)}
              </DayCardsRow>
            </div>
          </div>
        );
      })}
    </div>
  );
}
