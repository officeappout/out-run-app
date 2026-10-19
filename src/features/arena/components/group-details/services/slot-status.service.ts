/**
 * Schedule-manager slot status (lock + RSVP count) — a single attendance-doc
 * read per slot. (Split out of GroupDetailsDrawer.tsx; same read.)
 */
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ScheduleSlot } from '@/types/community.types';
import { getNextSlotDate } from '../utils/group-details-logic';

export interface SlotStatus {
  /** true only within the 80-min lobby window — the sole hard block on editing */
  locked: boolean;
  /** existing RSVP count for the next occurrence (informational, not a lock) */
  attendeeCount: number;
}

/** Returns lock status + RSVP count for the next occurrence of a slot.
 *  Lock = within 80-min lobby window only.
 *  Existing attendance docs outside that window are shown as a count but don't block editing. */
export async function getSlotStatus(groupId: string, slot: ScheduleSlot): Promise<SlotStatus> {
  const nextDate    = getNextSlotDate(slot.dayOfWeek, slot.time);
  const nextMs      = new Date(`${nextDate}T${slot.time}:00`).getTime();
  const minutesUntil = (nextMs - Date.now()) / 60_000;
  const locked      = minutesUntil >= 0 && minutesUntil <= 80;

  const attId  = `${nextDate}_${slot.time.replace(':', '-')}`;
  const attRef = doc(db, `community_groups/${groupId}/attendance/${attId}`);
  try {
    const snap = await getDoc(attRef);
    const data = snap.exists() ? snap.data() : null;
    const attendeeCount = data
      ? (typeof data.currentCount === 'number' ? data.currentCount : (data.attendees?.length ?? 0))
      : 0;
    return { locked, attendeeCount };
  } catch {
    return { locked, attendeeCount: 0 };
  }
}
