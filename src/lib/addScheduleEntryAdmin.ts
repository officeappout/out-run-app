/**
 * addScheduleEntryAdmin — server-side schedule entry writer (Admin SDK).
 *
 * Mirrors the read-then-write pattern of the client-side addScheduleEntry
 * (userSchedule.service.ts) so API routes can write schedule entries without
 * touching the client Firebase SDK.
 *
 * Axiom §5: Timestamp.now() is used for timestamps inside array elements.
 * FieldValue.serverTimestamp() is only valid at the document root level.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const COLLECTION = 'userSchedule';

function docId(uid: string, date: string): string {
  return `${uid}_${date}`;
}

function genEntryId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface AdminScheduleEntryPayload {
  entryId?: string;
  programIds: string[];
  type: 'training' | 'rest' | 'active_rest';
  source: string;
  completed: boolean;
  scheduledCategories?: string[];
  startTime?: string;   // 'HH:MM' 24h
  groupId?: string;
  groupName?: string;
  /** See UserScheduleEntry.isSoloScheduled */
  isSoloScheduled?: boolean;
}

/**
 * Upserts a schedule entry for the given uid on the given date.
 * If an entry with the same entryId already exists on that date, it is replaced.
 */
export async function addScheduleEntryAdmin(
  db: Firestore,
  uid: string,
  date: string,    // 'YYYY-MM-DD'
  payload: AdminScheduleEntryPayload,
): Promise<void> {
  const entryId = payload.entryId ?? genEntryId();
  const entry = {
    ...payload,
    entryId,
    userId: uid,
    date,
    createdAt: Timestamp.now(),  // axiom §5: Timestamp.now() inside array elements
    updatedAt: Timestamp.now(),  // axiom §5
  };

  const ref = db.doc(`${COLLECTION}/${docId(uid, date)}`);
  const snap = await ref.get();
  const existing: Record<string, unknown>[] = snap.exists
    ? ((snap.data()?.entries as Record<string, unknown>[]) ?? [])
    : [];

  const filtered = existing.filter((e) => e['entryId'] !== entryId);

  await ref.set({
    userId: uid,
    date,
    entries: [...filtered, entry],
    updatedAt: FieldValue.serverTimestamp(),  // document root — ok
  });
}
