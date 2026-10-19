/**
 * Kelly phase 3 — the only facts the flex-sentence model sees. Pure. Coarse and PII-free:
 * never a name, an id, a date, a number the user could be identified by, or anything the
 * user wrote.
 */
import type { ProactiveUserState } from './types';

export function flexFacts(s: Pick<ProactiveUserState, 'today' | 'week' | 'weather'>): string[] {
  const out: string[] = [];
  if (s.today.training && s.today.label) out.push(`today's session: ${s.today.label}`);
  if (s.week) out.push(s.week.workouts >= 3 ? 'this week: a steady week' : 'this week: a light week');
  if (s.week?.streakDays && s.week.streakDays >= 3) out.push('the user keeps a streak going');
  if (s.weather) out.push(`weather today: ${s.weather}`);
  return out;
}
