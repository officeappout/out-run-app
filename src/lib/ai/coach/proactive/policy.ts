/**
 * Kelly phase 3 — the gates EVERY proactive message passes, before any trigger is asked.
 * Pure. Order = the reason the admin preview shows first.
 *
 *   no_ai            the AI gate refuses this user (minor, no entitlement, AI off)
 *   opted_out        Settings → "הודעות מקלי" off (notificationPrefs.coach_proactive) or the
 *                    whole 'coach' channel off
 *   push_disabled    the user turned off all notifications
 *   already_today    max ONE proactive Kelly message a day (doc id proactive_{date} is the lock)
 *   quiet_hours      22:00–07:00 Israel (same window as push.service)
 *   shabbat          Shabbat / yom tov window, observers only (settings.shabbatObserver)
 *   retention_today  a retention push already went out today: never both on one day
 *   daily_cap        today's engagement pushes already reached the user's cap (the proactive
 *                    push is counted in the same cap, functions/src/onKellyThreadMessage.ts)
 *   calm_return      away RETURN_AFTER_DAYS (4) days or more: no proactive message at all —
 *                    the retention milestones (d4/d7/d14/d30) already handle lapsed users, and
 *                    a proactive "you missed" is exactly what calm return forbids. The one
 *                    exception is post_workout (they just trained, so they are back).
 */
import { RETURN_AFTER_DAYS } from '../suggestions/types';
import type { ProactiveTrigger, ProactiveUserState } from './types';

export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export type GateReason =
  | 'no_ai'
  | 'opted_out'
  | 'push_disabled'
  | 'already_today'
  | 'quiet_hours'
  | 'shabbat'
  | 'retention_today'
  | 'daily_cap'
  | 'calm_return';

/** null = every shared gate passes for this trigger. */
export function sharedGate(s: ProactiveUserState, trigger: ProactiveTrigger): GateReason | null {
  if (!s.hasAi) return 'no_ai';
  if (s.optedOut) return 'opted_out';
  if (!s.pushEnabled) return 'push_disabled';
  if (s.sentToday) return 'already_today';
  if (isQuietHour(s.clock.hour)) return 'quiet_hours';
  if (s.shabbatObserver && s.inRestWindow) return 'shabbat';
  if (s.retentionSentToday) return 'retention_today';
  if (s.dailyCountToday >= s.dailyCap) return 'daily_cap';
  if (trigger !== 'post_workout' && s.daysAway !== null && s.daysAway >= RETURN_AFTER_DAYS) return 'calm_return';
  return null;
}

// ─── Daily cap (same mapping as functions/src/services/push.service.ts resolveDailyCap) ──

const FREQUENCY_DAILY_CAPS: Record<string, number> = { min: 1, balanced: 3, high: 6 };
const MAX_DAILY_CAP = 6;

export function dailyCapFor(notificationFrequency: unknown): number {
  const cap = typeof notificationFrequency === 'string' && FREQUENCY_DAILY_CAPS[notificationFrequency] !== undefined
    ? FREQUENCY_DAILY_CAPS[notificationFrequency]
    : FREQUENCY_DAILY_CAPS.balanced;
  return Math.min(cap, MAX_DAILY_CAP);
}

/** Today's count from push_rate/{uid} (dailyEngagementDate / dailyEngagementCount). */
export function dailyCountFor(rate: Record<string, unknown> | undefined, todayKey: string): number {
  if (!rate || rate.dailyEngagementDate !== todayKey) return 0;
  return typeof rate.dailyEngagementCount === 'number' ? rate.dailyEngagementCount : 0;
}

/** Opt-out: the proactive toggle, or the whole Kelly push channel. Absent = on. */
export function isOptedOut(settings: Record<string, unknown> | undefined): boolean {
  const prefs = (settings?.notificationPrefs ?? {}) as Record<string, unknown>;
  return prefs.coach_proactive === false || prefs.coach === false;
}
