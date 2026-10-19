/**
 * Kelly phase 3 — which triggers a run evaluates, from the Israel clock. Pure.
 *
 * The scheduler runs every 15 minutes. post_workout is checked on every run (its window is
 * 45 minutes wide). The hour-based triggers are checked ONLY on the first run of their hour
 * (minute < 15): one evaluation per user per day instead of four, at the cost that a run
 * that fails at :00 does not retry that day (same "suppress, never defer" rule as the
 * training reminder).
 */
import { isQuietHour } from './policy';
import { ASSESSMENT_HOUR } from './triggers/assessment';
import { WEEKLY_DOW, WEEKLY_HOUR } from './triggers/weekly';
import type { IsraelClock, ProactiveTrigger } from './types';

export const MORNING_HOURS = { from: 7, to: 11 } as const;
export const FIRST_RUN_MINUTES = 15;

export function dueTriggers(c: Pick<IsraelClock, 'hour' | 'minute' | 'dow'>): ProactiveTrigger[] {
  if (isQuietHour(c.hour)) return [];
  const out: ProactiveTrigger[] = ['post_workout'];
  const firstRun = c.minute < FIRST_RUN_MINUTES;
  if (!firstRun) return out;
  if (c.hour >= MORNING_HOURS.from && c.hour <= MORNING_HOURS.to) out.push('weather', 'morning');
  if (c.dow === WEEKLY_DOW && c.hour === WEEKLY_HOUR) out.push('weekly');
  if (c.hour === ASSESSMENT_HOUR && c.dow <= 4) out.push('assessment');
  return out;
}
