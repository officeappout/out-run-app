/**
 * Reminder Schedule Service.
 *
 * Durable backend for the SettingsModal "תזכורות אימון" accordion (App Store
 * cleanup D6), un-shelved alongside this file. The original UI relied on
 * in-memory React state with no FCM/LocalNotifications persistence — settings
 * were lost on modal/app close. This gives it a real Firestore-backed store:
 * `users/{uid}.lifestyle.reminders.schedule` — an array of `{day, time}` slots.
 *
 * Per axioms.md §5: append via `arrayUnion` (never overwrite the whole array),
 * remove via getDoc → filter → updateDoc with the full remaining array
 * (`arrayRemove` silently fails on object-type elements).
 */

import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { ReminderSlot } from '@/features/user/core/types/user.types';

function slotsEqual(a: ReminderSlot, b: ReminderSlot): boolean {
  return a.day === b.day && a.time === b.time;
}

/** Reads the user's current reminder slots. Returns [] if none are set yet. */
export async function getReminderSchedule(uid: string): Promise<ReminderSlot[]> {
  const snap = await getDoc(doc(db, 'users', uid));
  const schedule = snap.data()?.lifestyle?.reminders?.schedule;
  return Array.isArray(schedule) ? (schedule as ReminderSlot[]) : [];
}

/**
 * Adds a reminder slot. No-op (returns the unchanged list) if an identical
 * {day, time} slot already exists — a user can't have two reminders at the
 * exact same weekly slot.
 */
export async function addReminderSlot(uid: string, slot: ReminderSlot): Promise<ReminderSlot[]> {
  const current = await getReminderSchedule(uid);
  if (current.some((s) => slotsEqual(s, slot))) return current;

  await updateDoc(doc(db, 'users', uid), {
    'lifestyle.reminders.schedule': arrayUnion(slot),
    updatedAt: serverTimestamp(),
  });
  return [...current, slot];
}

/** Removes a reminder slot matching {day, time} exactly. */
export async function removeReminderSlot(uid: string, slot: ReminderSlot): Promise<ReminderSlot[]> {
  const current = await getReminderSchedule(uid);
  const remaining = current.filter((s) => !slotsEqual(s, slot));
  if (remaining.length === current.length) return current; // nothing matched

  await updateDoc(doc(db, 'users', uid), {
    'lifestyle.reminders.schedule': remaining,
    updatedAt: serverTimestamp(),
  });
  return remaining;
}
