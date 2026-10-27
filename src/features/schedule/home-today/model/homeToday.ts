/**
 * The home "today" cards (board HomeToday, enable_schedule_tutorial_v1): what today holds, from the
 * saved week (lifestyle.scheduleDays + recurringTemplate + trainingTime) and today's live numbers.
 * Pure, no copy (__tests__/homeToday.test.ts).
 *
 * - A scheduled strength day: the workout card (check once done) + the steps card. Flames "N מתוך 2".
 * - Any other day: the steps card + a short optional session (core tabata). The optional card never
 *   counts toward the flames goal ("N מתוך 1"), it only makes the flame bigger (C4 / C5).
 */
import type { ScheduleItemId } from '@/features/schedule/types/smartSchedule.types';
import { DAY_LETTERS_HE } from '@/features/schedule/utils/strengthWeekRecommendation';
import { labelOf, OPTIONAL_MINUTES, type OptionalKind, type StrengthLabel } from '@/features/schedule/tutorial-v1/model/tutorialWeek';

export interface HomeTodayInput {
  /** 0 = Sunday. */
  todayDow: number;
  /** Day of the month, for the header ("יום א׳ · 25"). */
  dayOfMonth: number;
  /** profile.lifestyle.scheduleDays (Hebrew letters). */
  scheduleDays: readonly string[];
  /** profile.lifestyle.recurringTemplate (letter -> item ids). */
  recurringTemplate?: Partial<Record<string, readonly string[]>> | null;
  /** profile.lifestyle.trainingTime "HH:MM". */
  trainingTime?: string | null;
  strengthDone: boolean;
  /** Minutes of today's strength session(s), when done. */
  strengthMinutes?: number | null;
  steps: number;
  stepsGoal: number;
  optionalDone?: boolean;
}

export interface HomeTodayModel {
  dow: number;
  dayOfMonth: number;
  strength: { label: StrengthLabel; time: string | null; done: boolean; minutes: number | null } | null;
  steps: { steps: number; goal: number; pct: number; done: boolean };
  optional: { kind: OptionalKind; minutes: number; done: boolean } | null;
  flames: { closed: number; total: number };
  /** The next strength day after today (within the coming week), for the tour's week step. */
  next: { dow: number; time: string | null } | null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function itemsOf(input: HomeTodayInput, dow: number): ScheduleItemId[] {
  const raw = input.recurringTemplate?.[DAY_LETTERS_HE[dow]];
  return (raw && raw.length ? [...raw] : ['FULL_BODY']) as ScheduleItemId[];
}

/** The strength label of `dow`: the full-body emphasis rotates through the week's full-body days, Sunday first. */
export function strengthLabelOn(input: HomeTodayInput, dow: number): StrengthLabel {
  let fullBodyIndex = 0;
  for (let d = 0; d < dow; d++) {
    if (input.scheduleDays.includes(DAY_LETTERS_HE[d]) && labelOf(itemsOf(input, d), fullBodyIndex).kind === 'full_body') fullBodyIndex++;
  }
  return labelOf(itemsOf(input, dow), fullBodyIndex);
}

export function resolveHomeToday(input: HomeTodayInput): HomeTodayModel {
  const dow = input.todayDow;
  const time = input.trainingTime && HHMM.test(input.trainingTime) ? input.trainingTime : null;
  const isStrengthDay = (d: number) => input.scheduleDays.includes(DAY_LETTERS_HE[d]);
  const strength = isStrengthDay(dow)
    ? { label: strengthLabelOn(input, dow), time, done: input.strengthDone, minutes: input.strengthDone ? input.strengthMinutes ?? null : null }
    : null;

  const goal = Math.max(0, Math.round(input.stepsGoal));
  const steps = Math.max(0, Math.round(input.steps));
  const pct = goal > 0 ? Math.min(100, Math.round((steps / goal) * 100)) : 0;
  const stepsDone = goal > 0 && steps >= goal;

  const optional = strength ? null : { kind: 'core_tabata' as const, minutes: OPTIONAL_MINUTES.core_tabata, done: !!input.optionalDone };

  let next: HomeTodayModel['next'] = null;
  for (let k = 1; k <= 7; k++) {
    const d = (dow + k) % 7;
    if (isStrengthDay(d)) { next = { dow: d, time }; break; }
  }

  return {
    dow,
    dayOfMonth: input.dayOfMonth,
    strength,
    steps: { steps, goal, pct, done: stepsDone },
    optional,
    flames: { closed: (strength?.done ? 1 : 0) + (stepsDone ? 1 : 0), total: strength ? 2 : 1 },
    next,
  };
}
