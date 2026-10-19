/**
 * Trigger a — the morning line on a training day. Pure.
 *
 * Due in the run of the user's morning hour: their preferred training hour when it is a
 * morning hour (07–11), else 08:00. Today must have a planned, not yet done session that
 * has not started yet. Template: one short line about today's session; a strength session
 * gets the "בנה את האימון של היום" chip (build_today), anything else opens the schedule.
 *
 * If the once-a-day training reminder already went out today (push_rate
 * trainingReminderSentDate), the message is still written but SILENT (`silent: true` in
 * the vars → no push): never two pushes about the same session in one morning.
 */
import { skip, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from '../types';

export const DEFAULT_MORNING_HOUR = 8;

export function morningHourFor(preferredHour: number | null): number {
  return preferredHour !== null && preferredHour >= 7 && preferredHour <= 11 ? preferredHour : DEFAULT_MORNING_HOUR;
}

/** "HH:MM" already passed at `hour:minute`. */
export function startPassed(startTime: string | null, hour: number, minute: number): boolean {
  const m = startTime?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  return Number(m[1]) * 60 + Number(m[2]) <= hour * 60 + minute;
}

export function morningTrigger(s: ProactiveUserState, o: TriggerOptions = {}): TriggerDecision {
  const t = s.today;
  if (!t.training) return skip('morning', 'no_training_today');
  if (t.done) return skip('morning', 'done_today');
  if (!o.ignoreSlotTime && s.clock.hour !== morningHourFor(s.preferredHour)) return skip('morning', 'not_morning_hour');
  if (!o.ignoreSlotTime && startPassed(t.startTime, s.clock.hour, s.clock.minute)) return skip('morning', 'session_started');
  return {
    trigger: 'morning',
    shouldSend: true,
    templateKey: t.buildable ? 'morning' : 'morning_open',
    vars: { label: t.label ?? 'אימון', minutes: t.minutes, time: t.startTime, silent: s.trainingReminderToday ? 1 : null },
    why: `training today (${t.label ?? 'אימון'})${s.trainingReminderToday ? ', reminder already sent → silent' : ''}`,
  };
}
