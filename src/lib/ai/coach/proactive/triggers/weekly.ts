/**
 * Trigger b — the weekly summary, Friday ~10:00 Israel. Pure.
 *
 * Friday 10:00 is before the Shabbat window (14:00), so observers get it too; on an erev
 * yom tov Friday the shared gate still applies. Once per Friday (ledger weeklySentFor).
 * Only for a week with at least one workout: an empty week is not summarized (that would be
 * a "you missed" message, which calm return forbids; lapsed users are the retention
 * scheduler's).
 */
import { skip, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from '../types';

export const WEEKLY_DOW = 5;
export const WEEKLY_HOUR = 10;

export function weeklyTrigger(s: ProactiveUserState, o: TriggerOptions = {}): TriggerDecision {
  if (!o.ignoreSlotTime && (s.clock.dow !== WEEKLY_DOW || s.clock.hour !== WEEKLY_HOUR)) return skip('weekly', 'not_friday_10');
  if (s.ledger.weeklySentFor === s.clock.dateKey) return skip('weekly', 'already_this_week');
  const w = s.week;
  if (!w) return skip('weekly', 'no_week_data');
  if (w.workouts < 1) return skip('weekly', 'empty_week');
  return {
    trigger: 'weekly',
    shouldSend: true,
    templateKey: 'weekly',
    vars: { workouts: w.workouts, activeDays: w.activeDays, minutes: w.minutes, streak: w.streakDays, avgSteps: w.avgSteps },
    why: `${w.workouts} workouts this week`,
  };
}
