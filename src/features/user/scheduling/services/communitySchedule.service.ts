/**
 * Community Schedule Service
 *
 * Bridges community group scheduleSlots with the personal Training Planner.
 * - addCommunitySessionsToPlanner: writes community sessions as first-class
 *   `source: 'community'` entries inside `UserScheduleDay.entries[]`.
 * - removeCommunitySessionsFromPlanner: strips a group's community entries
 *   from userSchedule, never touching personal entries.
 * - generateCommunityICS: creates a downloadable .ics blob for native calendar sync.
 *
 * After the entries[] migration, community sessions are no longer stored as
 * a top-level `communitySessions[]` field — each session becomes a standalone
 * entry carrying `source: 'community'`, `groupId`, `groupName`, `startTime`,
 * and `scheduledCategories: [category]`.
 */

import type { ScheduleSlot } from '@/types/community.types';
import type {
  UserScheduleEntry,
  ScheduleActivityCategory,
} from '../types/schedule.types';
import {
  addScheduleEntry,
  getScheduleEntries,
  removeCommunityEntriesForGroup,
} from './userSchedule.service';

/** Horizon for how far ahead recurring slots are pre-populated. */
const WEEKS_AHEAD = 12;

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Expand a list of recurring `ScheduleSlot`s to concrete `(date, time)` pairs
 * for the next 12 weeks (84 days), respecting each slot's `frequency`:
 *   - 'weekly'   → step 7 days
 *   - 'biweekly' → step 14 days
 *   - 'monthly'  → step 30 days  (calendar-month approximation)
 *
 * The first occurrence is the earliest day on or after today matching
 * `slot.dayOfWeek`; subsequent occurrences are produced by adding `stepDays`.
 */
function expandSlotDates(
  slots: ScheduleSlot[],
): { date: string; time: string }[] {
  const results: { date: string; time: string }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const horizonDays = WEEKS_AHEAD * 7; // 84

  for (const slot of slots) {
    const stepDays =
      slot.frequency === 'biweekly' ? 14
      : slot.frequency === 'monthly' ? 30
      : 7; // weekly (default)

    let daysAhead = slot.dayOfWeek - now.getDay();
    if (daysAhead < 0) daysAhead += 7;

    for (let offset = daysAhead; offset < horizonDays; offset += stepDays) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      results.push({ date: toISODate(candidate), time: slot.time });
    }
  }
  return results;
}

/**
 * After a user joins a group, populate their Training Planner with
 * recurring community sessions for the next 12 weeks.
 *
 * Each occurrence is appended to the day's `entries[]` as a first-class
 * `source: 'community'` entry.  Personal entries on the same day are
 * preserved.  Same-group occurrences are deduped: if this group already has
 * an entry on the date, the call is a no-op.
 */
export async function addCommunitySessionsToPlanner(
  userId: string,
  groupId: string,
  groupName: string,
  category: string,
  scheduleSlots: ScheduleSlot[],
): Promise<void> {
  if (!scheduleSlots?.length) return;

  const dates = expandSlotDates(scheduleSlots);

  await Promise.all(
    dates.map(async ({ date, time }) => {
      try {
        const existing = await getScheduleEntries(userId, date);
        if (existing.some((e) => e.source === 'community' && e.groupId === groupId)) {
          return;
        }

        const entry: UserScheduleEntry = {
          userId,
          date,
          programIds: [],
          type: 'training',
          source: 'community',
          completed: false,
          groupId,
          groupName,
          startTime: time,
          scheduledCategories: [category as ScheduleActivityCategory],
        };

        await addScheduleEntry(userId, date, entry);
      } catch (err) {
        console.warn(`[CommunitySchedule] failed to write ${userId}_${date}:`, err);
      }
    }),
  );
}

/**
 * When a user leaves a group, remove that group's community entries from
 * their planner.  Delegates to `removeCommunityEntriesForGroup` which:
 *   - filters by `source === 'community' && groupId === groupId` only
 *   - never removes or modifies personal entries on the same day
 *   - deletes the day-doc entirely if no entries remain
 */
export async function removeCommunitySessionsFromPlanner(
  userId: string,
  groupId: string,
  scheduleSlots: ScheduleSlot[],
): Promise<void> {
  if (!scheduleSlots?.length) return;

  const dates = expandSlotDates(scheduleSlots);

  await Promise.all(
    dates.map(async ({ date }) => {
      try {
        await removeCommunityEntriesForGroup(userId, date, groupId);
      } catch (err) {
        console.warn(`[CommunitySchedule] failed to clean ${userId}_${date}:`, err);
      }
    }),
  );
}

// ── ICS Calendar Generation ───────────────────────────────────────────────

interface ICSEvent {
  groupName: string;
  category: string;
  dayOfWeek: number;
  time: string;
  address?: string;
}

function dayToRRULE(day: number): string {
  const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return map[day];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Generate an ICS (iCalendar) string for all the user's joined community
 * groups. Each group's schedule slot becomes a recurring VEVENT.
 */
export function generateCommunityICS(
  events: ICSEvent[],
): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OutRun//Community Sessions//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OutRun - מפגשים קהילתיים',
  ];

  for (const evt of events) {
    const [hour, minute] = evt.time.split(':').map(Number);
    let daysAhead = evt.dayOfWeek - now.getDay();
    if (daysAhead < 0) daysAhead += 7;
    const start = new Date(now);
    start.setDate(now.getDate() + daysAhead);
    start.setHours(hour, minute, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);

    const dtStart = `${start.getFullYear()}${pad2(start.getMonth() + 1)}${pad2(start.getDate())}T${pad2(hour)}${pad2(minute)}00`;
    const dtEnd = `${end.getFullYear()}${pad2(end.getMonth() + 1)}${pad2(end.getDate())}T${pad2(end.getHours())}${pad2(end.getMinutes())}00`;
    const uid = `outrun-${evt.groupName.replace(/\s/g, '-')}-${evt.dayOfWeek}@outrun.app`;

    lines.push(
      'BEGIN:VEVENT',
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${dayToRRULE(evt.dayOfWeek)}`,
      `SUMMARY:${evt.groupName}`,
      `DESCRIPTION:אימון קהילתי - ${evt.category}`,
      evt.address ? `LOCATION:${evt.address}` : '',
      `UID:${uid}`,
      `DTSTAMP:${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}T${pad2(now.getHours())}${pad2(now.getMinutes())}00Z`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

/**
 * Trigger a download of the ICS file in the browser.
 */
export function downloadICS(icsContent: string, filename = 'outrun-community.ics'): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
