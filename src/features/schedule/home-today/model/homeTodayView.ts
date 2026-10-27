/**
 * The home today model as display data for the shared day cards (src/features/schedule/day-cards).
 * Pure: the caller passes t() of the `schedule` and `common` namespaces and the locale.
 */
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import { weekdayLabel, withUnit, type CommonT } from '@/lib/i18n/units';
import type { OptionalCardData, StepsCardData, WorkoutCardData } from '@/features/schedule/day-cards/types';
import { GROUP_ICON, strengthIcon, strengthTitle, type ScheduleT } from '@/features/schedule/tutorial-v1/model/weekCards';
import type { HomeTodayModel } from './homeToday';

export interface HomeTodayView {
  date: string;
  flames: string;
  flamesAria: string;
  workout: WorkoutCardData | null;
  steps: StepsCardData;
  optional: OptionalCardData | null;
  hint: string;
}

const morningOrEvening = (time: string | null): 'morning' | 'noon' | 'evening' => {
  const h = time ? Number(time.slice(0, 2)) : 7;
  return h < 11 ? 'morning' : h < 16 ? 'noon' : 'evening';
};

export function homeTodayView(t: ScheduleT, tc: CommonT, locale: Locale, m: HomeTodayModel): HomeTodayView {
  const s = m.strength;
  const workout: WorkoutCardData | null = s
    ? {
        tone: 'strength',
        title: strengthTitle(t, s.label),
        subtitle: s.done
          ? s.minutes ? t('homeToday.done', { min: withUnit('min', formatNumber(s.minutes, locale), tc) }) : t('homeToday.doneNoMin')
          : s.plannedMinutes ? t('dayCards.strength.subtitle', { min: withUnit('min', formatNumber(s.plannedMinutes, locale), tc), note: 'none' }) : undefined,
        time: s.done ? undefined : s.time ?? undefined,
        timeTone: morningOrEvening(s.time),
        iconSrc: strengthIcon(s.label),
        done: s.done,
      }
    : null;
  const steps: StepsCardData = {
    goalLabel: withUnit('steps', formatNumber(m.steps.goal, locale), tc),
    subtitle: t('dayCards.steps.soFar', { n: formatNumber(m.steps.steps, locale) }),
    pct: m.steps.pct,
  };
  const optional: OptionalCardData | null = m.optional
    ? {
        title: t('dayCards.optional.title', { kind: m.optional.kind, n: m.optional.minutes }),
        subtitle: t('homeToday.optionalRole'),
        iconSrc: m.optional.kind === 'core_tabata' ? GROUP_ICON.core : undefined,
        done: m.optional.done,
      }
    : null;
  const vals = { closed: formatNumber(m.flames.closed, locale), total: formatNumber(m.flames.total, locale) };
  return {
    date: t('homeToday.date', { day: weekdayLabel(m.dow, 'short', tc), date: formatNumber(m.dayOfMonth, locale) }),
    flames: t('homeToday.flames', vals),
    flamesAria: t('homeToday.flamesAria', vals),
    workout,
    steps,
    optional,
    hint: t('homeToday.hint', { kind: s ? 'workout' : 'rest' }),
  };
}
