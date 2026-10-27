/**
 * The tutorial week as display data for the shared day cards (src/features/schedule/day-cards).
 * Pure: the caller passes t() of the `schedule` and `common` namespaces and the locale
 * (__tests__/weekCards.test.ts).
 */
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import { withUnit, type CommonT } from '@/lib/i18n/units';
import type { ScheduleKey } from '@/messages/ns/schedule';
import type { OptionalCardData, StepsCardData, WorkoutCardData } from '@/features/schedule/day-cards/types';
import type { SkillId } from '@/features/schedule/types/smartSchedule.types';
import type { StrengthLabel, TutorialDay, TutorialWeek, WeekChip } from './tutorialWeek';
import { programLabels } from './tutorialWeek';

export type ScheduleT = (key: ScheduleKey, values?: MessageValues) => string;

const SKILL_ICON: Record<SkillId, string> = {
  PLANCHE: '/icons/programs/planche.svg',
  FRONT_LEVER: '/icons/programs/front_lever.svg',
  HSPU: '/icons/programs/hspu.svg',
  OAPU: '/icons/programs/one_arm_pullup.svg',
  MUSCLE_UP: '/icons/programs/muscle_up_bar.svg',
  HANDSTAND: '/icons/programs/handstand.svg',
};
export const GROUP_ICON: Record<'push' | 'pull' | 'legs' | 'core', string> = {
  push: '/icons/muscles/chest.svg',
  pull: '/icons/muscles/back.svg',
  legs: '/icons/muscles/quads.svg',
  core: '/icons/muscles/abs.svg',
};
export const RUN_ICON = '/icons/programs/Run.svg';

export function strengthIcon(l: StrengthLabel): string {
  switch (l.kind) {
    case 'full_body': return '/icons/programs/full_body.svg';
    case 'upper': return '/icons/programs/muscle.svg';
    case 'legs': return '/icons/programs/leg.svg';
    case 'skill': return SKILL_ICON[l.skill];
  }
}

export function strengthTitle(t: ScheduleT, l: StrengthLabel): string {
  switch (l.kind) {
    case 'full_body': return t('dayCards.strength.fullBody', { focus: t(`dayCards.group.${l.emphasis}`) });
    case 'upper': return t('dayCards.strength.upper');
    case 'legs': return t('dayCards.strength.legs');
    case 'skill': return t('dayCards.strength.skill', { family: t(`dayCards.group.${l.family}`), skill: t(`dayCards.skillShort.${l.skill}`) });
  }
}

/** A program's name in a list ("פלאנץ׳, פרונט לבר, רגליים ו-3 ריצות"). */
function programName(t: ScheduleT, l: StrengthLabel): string {
  switch (l.kind) {
    case 'skill': return t(`dayCards.skillName.${l.skill}`);
    case 'legs': return t('dayCards.strength.legs');
    case 'upper': return t('dayCards.strength.upper');
    case 'full_body': return t('dayCards.strength.fullBodyName');
  }
}

export function programsList(t: ScheduleT, week: TutorialWeek, locale: Locale): string {
  const parts = programLabels(week).map((l) => programName(t, l));
  if (week.runCount > 0) parts.push(t('tutorial.days.runs', { n: week.runCount }));
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(parts);
}

export function chipLabel(t: ScheduleT, c: WeekChip): string {
  if (c.type === 'group') return t(`dayCards.group.${c.group}`);
  if (c.type === 'run') return t('dayCards.run.label');
  return strengthTitle(t, c.label);
}

export function chipIcon(c: WeekChip): string {
  if (c.type === 'group') return GROUP_ICON[c.group];
  if (c.type === 'run') return RUN_ICON;
  return strengthIcon(c.label);
}

export interface DayCardsView {
  workouts: WorkoutCardData[];
  steps: StepsCardData;
  optional: OptionalCardData[];
}

export function dayCardsView(
  t: ScheduleT,
  tc: CommonT,
  locale: Locale,
  day: TutorialDay,
  today: { isToday: boolean; stepsToday: number },
): DayCardsView {
  const min = (n: number) => withUnit('min', n, tc);
  const workouts: WorkoutCardData[] = day.runs.map((r) => ({
    tone: 'run',
    title: t('dayCards.run.title', { slot: r.slot }),
    subtitle: t('dayCards.run.subtitle', { slot: r.slot, min: min(r.minutes) }),
    time: r.time,
    timeTone: 'run',
    iconSrc: RUN_ICON,
  }));
  if (day.strength) {
    const s = day.strength;
    workouts.push({
      tone: 'strength',
      title: strengthTitle(t, s.label),
      subtitle: t('dayCards.strength.subtitle', { min: min(s.minutes), note: s.afterRun ? 'afterRun' : s.skillLed ? 'skill' : 'none' }),
      time: s.time,
      timeTone: s.window,
      iconSrc: strengthIcon(s.label),
    });
  }
  const pct = today.isToday && day.stepsGoal > 0 ? Math.min(100, Math.round((today.stepsToday / day.stepsGoal) * 100)) : 0;
  const steps: StepsCardData = {
    goalLabel: withUnit('steps', formatNumber(day.stepsGoal, locale), tc),
    subtitle: today.isToday && today.stepsToday > 0
      ? t('dayCards.steps.soFar', { n: formatNumber(today.stepsToday, locale) })
      : day.movement ? t('dayCards.steps.movementDay') : undefined,
    pct,
  };
  const optional: OptionalCardData[] = day.optional.map((o) => ({
    title: t('dayCards.optional.title', { kind: o.kind, n: o.minutes }),
    subtitle: t('dayCards.optional.role', { role: o.role }),
    iconSrc: o.kind === 'core_tabata' ? GROUP_ICON.core : undefined,
  }));
  return { workouts, steps, optional };
}

/** Consecutive no-workout days with the same cards merge into one row ("ו׳–ש׳"). */
export function groupRestDays(days: TutorialDay[]): TutorialDay[][] {
  const out: TutorialDay[][] = [];
  const sig = (d: TutorialDay) => (d.free || d.strength || d.runs.length ? null : `${d.stepsGoal}|${d.optional.map((o) => o.kind).join(',')}`);
  for (const d of days) {
    const last = out[out.length - 1];
    const s = sig(d);
    if (s && last && sig(last[0]) === s && last[last.length - 1].dow === (d.dow + 6) % 7) last.push(d);
    else out.push([d]);
  }
  return out;
}
