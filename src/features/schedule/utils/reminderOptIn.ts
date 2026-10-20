/**
 * Reminder opt-in (shared by the run, strength and add-track flows —
 * enable_home_v2, boards jr/J1-10, J1-11, J2-09, J3-06, J4-06). Pure.
 *
 * "X minutes before each workout" is stored with the app's existing durable
 * reminder store, users/{uid}.lifestyle.reminders.schedule (ReminderSlot
 * {day, time}, swept every 5 minutes by reminderSweepScheduler): one slot per
 * training day at (workout time − lead), on the 5-minute grid.
 */
import type { ReminderSlot, ReminderWeekday } from '@/features/user/core/types/user.types';

export type ReminderLeadMinutes = 15 | 30 | 60;

export const REMINDER_LEAD_OPTIONS: ReadonlyArray<{ minutes: ReminderLeadMinutes; label: string }> = [
  { minutes: 15, label: '15 דק׳' },
  { minutes: 30, label: '30 דק׳' },
  { minutes: 60, label: 'שעה' },
];
export const DEFAULT_REMINDER_LEAD: ReminderLeadMinutes = 30;

const WEEKDAYS: readonly ReminderWeekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One reminder slot per workout at (time − lead), floored to the 5-minute
 * grid; a lead that crosses midnight lands on the previous day. Deduped.
 */
export function reminderSlotsFor(
  sessions: ReadonlyArray<{ dow: number; time: string }>,
  leadMinutes: ReminderLeadMinutes,
): ReminderSlot[] {
  const out: ReminderSlot[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.time);
    if (!m || s.dow < 0 || s.dow > 6) continue;
    let total = Number(m[1]) * 60 + Number(m[2]) - leadMinutes;
    let dow = s.dow;
    if (total < 0) {
      total += 24 * 60;
      dow = (dow + 6) % 7;
    }
    total = Math.floor(total / 5) * 5;
    const slot: ReminderSlot = { day: WEEKDAYS[dow], time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
    const key = `${slot.day}|${slot.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

export type PushPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * "התזכורות כבר פעילות": the OS already allows notifications AND the user
 * explicitly turned push on (settings.pushEnabled === true — undefined is
 * only the opt-out default, not a choice) without muting training reminders.
 */
export function isReminderAlreadyActive(input: {
  permission: PushPermissionState;
  pushEnabled: unknown;
  trainingReminder: unknown;
}): boolean {
  return input.permission === 'granted' && input.pushEnabled === true && input.trainingReminder !== false;
}

/** "עוד 30 דק׳: ריצה קלה · 19:00" — the sample notification on the step. */
export function reminderPreviewTitle(lead: ReminderLeadMinutes, workoutName: string, time: string): string {
  const when = lead === 60 ? 'עוד שעה' : `עוד ${lead} דק׳`;
  return `${when}: ${workoutName} · ${time}`;
}
