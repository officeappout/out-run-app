/**
 * Strength signup week (engine v2 via strengthWeekRecommendation) ⇄ week builder.
 *
 * Day focus: the recommended split steers each strength day by its POSITION in the week
 * (1st = upper, 2nd = lower …; day-focus.utils — exactly what the workout generator will
 * do with the saved days). So the cards show that focus, the engine validates moves with the
 * focus' own load (two leg days in a row break the 48h rule), and after a move the focus is
 * re-derived by position — the same answer the generator gives. Only a full-body program is
 * steered (the generator only narrows a pool that covers the focus). Pure.
 */
import { DAY_FOCUS_HE, dayFocusOf, type DayFocus } from '@/features/workout-engine/services/split-decision/day-focus.utils';
import type { SessionType } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { scheduleIdNameHe } from '../../engine/strengthVocabulary';
import type { TimeWindow } from '../../engine-v2/types';
import type { ScheduleItemId } from '../../types/smartSchedule.types';
import {
  DEFAULT_STRENGTH_WINDOW,
  slugOfItem,
  type StrengthWeekRecommendation,
} from '../../utils/strengthWeekRecommendation';
import { explainWeek } from '../explain';
import type { WbRules, WbWeek } from '../types';
import { detailLineHe, emptyWeek } from './shared';

export interface StrengthWbData {
  /** The day's schedule ids, handstand first (what the template stores). */
  items: ScheduleItemId[];
  /** Engine slug / title before the focus. */
  baseSlug: string;
  baseTitleHe: string;
}

const FOCUS_SLUG: Record<Exclude<DayFocus, 'full'>, string> = {
  upper: 'upper_body',
  lower: 'legs',
  push: 'push',
  pull: 'pull',
  legs: 'legs',
};

const mainItems = (items: readonly ScheduleItemId[]) => items.filter((id) => id !== 'HANDSTAND');

/** Re-derives each strength day's focus from its position (no-op without a steering split). */
export function applyStrengthFocus(week: WbWeek<StrengthWbData>, split: SessionType | null): WbWeek<StrengthWbData> {
  let index = 0;
  const days = week.days.map((day) => ({
    ...day,
    sessions: day.sessions.map((s) => {
      if (s.track !== 'strength' || !s.data) return s;
      const focus = s.data.baseSlug === 'full_body' ? dayFocusOf(split, index) : null;
      index++;
      const steered = focus && focus !== 'full';
      return {
        ...s,
        slug: steered ? FOCUS_SLUG[focus] : s.data.baseSlug,
        titleHe: steered ? DAY_FOCUS_HE[focus] : s.data.baseTitleHe,
      };
    }),
  }));
  return { ...week, days };
}

export interface StrengthToWbInput {
  week: StrengthWeekRecommendation;
  /** Days a session may go to (the user's free days). */
  openDays: readonly number[];
  split: SessionType | null;
}

export function strengthWeekToWb(i: StrengthToWbInput, rules: WbRules): WbWeek<StrengthWbData> {
  const windows: Partial<Record<number, TimeWindow>> = {};
  for (const d of i.week.days) windows[d.dow] = d.window;
  const base = emptyWeek<StrengthWbData>(Array.from(new Set([...i.openDays, ...i.week.days.map((d) => d.dow)])), windows, DEFAULT_STRENGTH_WINDOW);
  i.week.days.forEach((d, n) => {
    const main = mainItems(d.items);
    const baseSlug = slugOfItem(main[0] ?? d.items[0] ?? 'FULL_BODY');
    const baseTitleHe = (main.length ? main : d.items).map(scheduleIdNameHe).join(' + ');
    base.days[d.dow].sessions.push({
      id: `strength-${n}`,
      track: 'strength',
      slug: baseSlug,
      titleHe: baseTitleHe,
      detailHe: detailLineHe(d.minutes, d.window),
      minutes: d.minutes,
      homeDow: null,
      data: { items: [...d.items], baseSlug, baseTitleHe },
    });
  });
  const focused = applyStrengthFocus({ ...base, warningsHe: [...i.week.warningsHe] }, i.split);
  return explainWeek(focused, rules);
}

/** The edited week back to the signup's own shape (buildStrengthScheduleWrite reads it). */
export function wbToStrengthWeek(wb: WbWeek<StrengthWbData>, recoveryHours: number): StrengthWeekRecommendation {
  const days = wb.days.flatMap((day) =>
    day.sessions
      .filter((s) => s.track === 'strength' && s.data)
      .map((s) => ({
        dow: day.dow,
        items: [...s.data!.items],
        window: day.window,
        minutes: s.minutes ?? 0,
        reasonHe: day.whyHe ?? '',
      })),
  );
  return { days, warningsHe: [...wb.warningsHe], recoveryHours };
}
