/**
 * Community Schedule Service
 *
 * Bridges community group scheduleSlots with the personal Training Planner.
 * - addCommunitySessionsToPlanner: writes community session refs into userSchedule
 * - removeCommunitySessionsFromPlanner: strips a group's sessions from userSchedule
 * - generateCommunityICS: creates a downloadable .ics blob for native calendar sync
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ScheduleSlot } from '@/types/community.types';
import type { CommunitySessionRef, UserScheduleEntry } from '../types/schedule.types';

const COLLECTION = 'userSchedule';
const WEEKS_AHEAD = 8;

function docId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Given a list of ScheduleSlots, compute all concrete dates
 * for the next WEEKS_AHEAD weeks and return them as ISO strings.
 */
function expandSlotDates(
  slots: ScheduleSlot[],
): { date: string; time: string }[] {
  const results: { date: string; time: string }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const slot of slots) {
    for (let w = 0; w < WEEKS_AHEAD; w++) {
      const candidate = new Date(now);
      let daysAhead = slot.dayOfWeek - candidate.getDay();
      if (daysAhead < 0) daysAhead += 7;
      candidate.setDate(candidate.getDate() + daysAhead + w * 7);
      if (candidate >= now) {
        results.push({ date: toISODate(candidate), time: slot.time });
      }
    }
  }
  return results;
}

/**
 * After a user joins a group, populate their Training Planner with
 * recurring community sessions for the next WEEKS_AHEAD weeks.
 *
 * Merges into existing entries (personal workouts are not overwritten).
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
      const id = docId(userId, date);
      const ref = doc(db, COLLECTION, id);

      try {
        const snap = await getDoc(ref);
        const newSession: CommunitySessionRef = { groupId, groupName, time, category };

        if (snap.exists()) {
          const existing = snap.data() as UserScheduleEntry;
          const sessions = existing.communitySessions ?? [];
          if (sessions.some((s) => s.groupId === groupId)) return;
          await setDoc(
            ref,
            {
              communitySessions: [...sessions, newSession],
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          const entry: Partial<UserScheduleEntry> = {
            userId,
            date,
            programIds: [],
            type: 'training',
            source: 'community',
            completed: false,
            startTime: time,
            communitySessions: [newSession],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(ref, entry, { merge: false });
        }
      } catch (err) {
        console.warn(`[CommunitySchedule] failed to write ${id}:`, err);
      }
    }),
  );
}

/**
 * When a user leaves a group, remove that group's community sessions
 * from their planner. If a day only had community sessions (no personal
 * workouts), the entry is converted to a rest day.
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
      const id = docId(userId, date);
      const ref = doc(db, COLLECTION, id);

      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const existing = snap.data() as UserScheduleEntry;
        const sessions = (existing.communitySessions ?? []).filter(
          (s) => s.groupId !== groupId,
        );

        if (
          sessions.length === 0 &&
          (!existing.programIds || existing.programIds.length === 0) &&
          existing.source === 'community'
        ) {
          const { deleteDoc } = await import('firebase/firestore');
          await deleteDoc(ref);
        } else {
          await setDoc(
            ref,
            {
              communitySessions: sessions,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (err) {
        console.warn(`[CommunitySchedule] failed to clean ${id}:`, err);
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
