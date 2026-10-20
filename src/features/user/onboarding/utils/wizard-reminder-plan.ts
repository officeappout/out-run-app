/**
 * What the wizard's shared reminders step (ReminderOptInStep, enable_home_v2)
 * shows and schedules: the subtitle, the sample notification and one
 * {dow, time} per workout (→ reminderSlotsFor). Pure.
 *
 * Strength: from the confirmed engine-v2 week. Running (the wizard's running
 * step): from the days/time that step put in the onboarding store.
 */
import { scheduleIdNameHe } from '@/features/schedule/engine/strengthVocabulary';
import { RUN_TIME_PRESETS, dayLettersLine } from '@/features/schedule/utils/runWeekRecommendation';
import {
  strengthReminderSubtitle,
  strengthSessionTimes,
  type StrengthWeekRecommendation,
} from '@/features/schedule/utils/strengthWeekRecommendation';

export interface WizardReminderPlan {
  subtitle: string;
  sampleWorkoutName: string;
  sampleTime: string;
  sessions: Array<{ dow: number; time: string }>;
}

/** Nothing known yet — a neutral step that still turns reminders on. */
export const EMPTY_REMINDER_PLAN: WizardReminderPlan = {
  subtitle: 'לפי הימים שבחרת',
  sampleWorkoutName: 'אימון',
  sampleTime: RUN_TIME_PRESETS.evening.time,
  sessions: [],
};

export function strengthReminderPlan(week: StrengthWeekRecommendation): WizardReminderPlan {
  const first = week.days[0];
  if (!first) return EMPTY_REMINDER_PLAN;
  const main = first.items.find((id) => id !== 'HANDSTAND') ?? first.items[0];
  return {
    subtitle: strengthReminderSubtitle(week),
    sampleWorkoutName: main ? scheduleIdNameHe(main) : 'אימון כוח',
    sampleTime: RUN_TIME_PRESETS[first.window].time,
    sessions: strengthSessionTimes(week),
  };
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

export function runningReminderPlan(store: {
  runningScheduleDayIndices?: unknown;
  runningScheduleTime?: unknown;
}): WizardReminderPlan {
  const raw = Array.isArray(store.runningScheduleDayIndices) ? store.runningScheduleDayIndices : [];
  const days = Array.from(new Set(raw.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
  if (days.length === 0) return EMPTY_REMINDER_PLAN;
  const time = typeof store.runningScheduleTime === 'string' && TIME_RE.test(store.runningScheduleTime)
    ? store.runningScheduleTime
    : RUN_TIME_PRESETS.morning.time;
  return {
    subtitle: `${days.length === 1 ? 'ריצה אחת' : `${days.length} ריצות`} בשבוע · ${dayLettersLine(days)}`,
    sampleWorkoutName: 'ריצה',
    sampleTime: time,
    sessions: days.map((dow) => ({ dow, time })),
  };
}
