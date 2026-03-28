/**
 * Booking & RSVP Service
 *
 * Manages session attendance via the sub-collection:
 *   community_groups/{groupId}/attendance/{YYYY-MM-DD_HH-mm}
 *
 * Each document tracks who booked a specific session occurrence.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SessionAttendance, ScheduleSlot } from '@/types/community.types';

function attendanceDocId(date: string, time: string): string {
  return `${date}_${time.replace(':', '-')}`;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Strip keys whose value is undefined — Firestore rejects them. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Safe profile object — never contains undefined values. */
function safeProfile(name?: string, photo?: string | null) {
  return { name: name || 'משתמש', photoURL: photo ?? null };
}

/**
 * Book (RSVP) the current user into a specific session.
 * Creates the attendance doc if it doesn't exist yet (first booker).
 */
export async function bookSession(
  groupId: string,
  date: string,
  time: string,
  uid: string,
  userName?: string,
  photoURL?: string | null,
  maxParticipants?: number,
): Promise<{ success: boolean; full?: boolean; waitlisted?: boolean }> {
  if (!uid) {
    console.warn('[bookSession] called without uid — aborting');
    return { success: false };
  }

  const docId = attendanceDocId(date, time);
  const ref = doc(db, 'community_groups', groupId, 'attendance', docId);
  const profile = safeProfile(userName, photoURL);

  try {
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as SessionAttendance;

      if (data.attendees?.includes(uid)) return { success: true };
      if ((data.waitlist ?? []).includes(uid)) return { success: true, waitlisted: true };

      const isFull = data.maxParticipants != null && data.currentCount >= data.maxParticipants;

      if (isFull) {
        await updateDoc(ref, {
          waitlist: arrayUnion(uid),
          [`waitlistProfiles.${uid}`]: profile,
        });
        return { success: true, waitlisted: true };
      }

      await updateDoc(ref, {
        attendees: arrayUnion(uid),
        currentCount: increment(1),
        [`attendeeProfiles.${uid}`]: profile,
      });
    } else {
      const newDoc = stripUndefined({
        groupId,
        date,
        time,
        attendees: [uid],
        currentCount: 1,
        maxParticipants: maxParticipants != null ? maxParticipants : null,
        attendeeProfiles: { [uid]: profile },
        createdAt: serverTimestamp(),
      });
      await setDoc(ref, newDoc);
    }

    return { success: true };
  } catch (err) {
    console.error('[bookSession] failed:', err);
    return { success: false };
  }
}

/**
 * Remove a user from the waitlist.
 */
export async function leaveWaitlist(
  groupId: string,
  date: string,
  time: string,
  uid: string,
): Promise<boolean> {
  const docId = attendanceDocId(date, time);
  const ref = doc(db, 'community_groups', groupId, 'attendance', docId);
  try {
    await updateDoc(ref, {
      waitlist: arrayRemove(uid),
      [`waitlistProfiles.${uid}`]: null,
    });
    return true;
  } catch (err) {
    console.error('[leaveWaitlist] failed:', err);
    return false;
  }
}

/**
 * Cancel a booking for the current user.
 * If there's a waitlist, auto-promotes the first person in line.
 */
export async function cancelBooking(
  groupId: string,
  date: string,
  time: string,
  uid: string,
): Promise<boolean> {
  const docId = attendanceDocId(date, time);
  const ref = doc(db, 'community_groups', groupId, 'attendance', docId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return true;
    const data = snap.data() as SessionAttendance;

    await updateDoc(ref, {
      attendees: arrayRemove(uid),
      currentCount: increment(-1),
      [`attendeeProfiles.${uid}`]: null,
    });

    const waitlist = data.waitlist ?? [];
    if (waitlist.length > 0) {
      const promoted = waitlist[0];
      const promotedProfile = data.waitlistProfiles?.[promoted];
      await updateDoc(ref, {
        waitlist: arrayRemove(promoted),
        [`waitlistProfiles.${promoted}`]: null,
        attendees: arrayUnion(promoted),
        currentCount: increment(1),
        [`attendeeProfiles.${promoted}`]: promotedProfile ?? { name: 'User', photoURL: null },
      });
    }

    return true;
  } catch (err) {
    console.error('[cancelBooking] failed:', err);
    return false;
  }
}

/**
 * Get attendance data for a specific session.
 */
export async function getSessionAttendance(
  groupId: string,
  date: string,
  time: string,
): Promise<SessionAttendance | null> {
  const docId = attendanceDocId(date, time);
  const ref = doc(db, 'community_groups', groupId, 'attendance', docId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as SessionAttendance;
  } catch (err) {
    console.error('[getSessionAttendance] failed:', err);
    return null;
  }
}

/**
 * Compute the next upcoming session from a group's schedule slots.
 * Returns the date + time + slot metadata.
 */
export function computeNextSession(
  slots: ScheduleSlot[],
): { date: string; time: string; slot: ScheduleSlot } | null {
  if (!slots?.length) return null;
  const now = new Date();
  let best: { date: string; time: string; slot: ScheduleSlot } | null = null;
  let bestDt: Date | null = null;

  for (const slot of slots) {
    const [hour, minute] = slot.time.split(':').map(Number);
    let daysAhead = slot.dayOfWeek - now.getDay();
    if (
      daysAhead < 0 ||
      (daysAhead === 0 && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute)
    ) {
      daysAhead += 7;
    }
    const next = new Date(now);
    next.setDate(now.getDate() + daysAhead);
    next.setHours(hour, minute, 0, 0);

    if (!bestDt || next < bestDt) {
      bestDt = next;
      best = { date: toISODate(next), time: slot.time, slot };
    }
  }
  return best;
}

/**
 * Check if a user has any upcoming booked sessions (today or tomorrow)
 * across all their joined groups.
 */
export async function getUserUpcomingSessions(
  groupIds: string[],
): Promise<{ groupId: string; groupName?: string; date: string; time: string; attendance: SessionAttendance }[]> {
  if (!groupIds.length) return [];

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dates = [toISODate(today), toISODate(tomorrow)];

  const results: { groupId: string; groupName?: string; date: string; time: string; attendance: SessionAttendance }[] = [];

  await Promise.all(
    groupIds.map(async (groupId) => {
      try {
        const colRef = collection(db, 'community_groups', groupId, 'attendance');
        const snaps = await getDocs(colRef);
        snaps.forEach((snap) => {
          const data = snap.data() as SessionAttendance;
          if (dates.includes(data.date)) {
            results.push({ groupId, date: data.date, time: data.time, attendance: data });
          }
        });
      } catch {
        // non-fatal
      }
    }),
  );

  return results.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}
