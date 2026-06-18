/**
 * Session Phase Service
 *
 * Writes live-phase fields to:
 *   community_groups/{groupId}/attendance/{YYYY-MM-DD_HH-mm}   ← leader writes
 *   community_groups/{groupId}/attendance/{sessionId}/member_statuses/{uid}  ← member writes
 *
 * Firestore rules enforce that:
 *   - Only a group admin can write sessionPhase / lobbyExtendedUntil
 *   - Each member can write only their own member_statuses document
 */

import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MemberSessionStatus } from '@/types/community.types';

// ── helpers ───────────────────────────────────────────────────────────────────

function attendanceDocId(date: string, time: string): string {
  return `${date}_${time.replace(':', '-')}`;
}

function attendanceRef(groupId: string, date: string, time: string) {
  return doc(db, `community_groups/${groupId}/attendance/${attendanceDocId(date, time)}`);
}

// ── leader actions ────────────────────────────────────────────────────────────

/**
 * Leader (or system 'auto' fallback) marks a session as active or ended.
 * Requires role: 'admin' in the group's members subcollection (enforced by Firestore rules).
 */
export async function setSessionPhase(
  groupId: string,
  date: string,
  time: string,
  phase: 'active' | 'ended',
  updatedBy: string, // uid of leader, or the literal 'auto'
): Promise<void> {
  await updateDoc(attendanceRef(groupId, date, time), {
    sessionPhase: phase,
    sessionPhaseUpdatedAt: Timestamp.now(),
    sessionPhaseUpdatedBy: updatedBy,
  });
}

/**
 * Leader extends the lobby window when a member marks herself late.
 * Sets lobbyExtendedUntil = now + extraMinutes.
 */
export async function extendLobby(
  groupId: string,
  date: string,
  time: string,
  extraMinutes: 2 | 5 | 10 | 15,
): Promise<void> {
  const extendedUntil = new Date(Date.now() + extraMinutes * 60_000);
  await updateDoc(attendanceRef(groupId, date, time), {
    lobbyExtendedUntil: Timestamp.fromDate(extendedUntil),
  });
}

// ── member action ─────────────────────────────────────────────────────────────

/**
 * Member marks her own travel status for a session.
 * Writes to the member_statuses subcollection — each member can only write her own document.
 *
 * skip = "מתאמנת לבד": removes the session from the home-screen banner without leaving the group.
 */
export async function setMyAttendeeStatus(
  uid: string,
  groupId: string,
  date: string,
  time: string,
  status: MemberSessionStatus['status'],
  lateMinutes?: MemberSessionStatus['lateMinutes'],
): Promise<void> {
  const statusRef = doc(
    db,
    `community_groups/${groupId}/attendance/${attendanceDocId(date, time)}/member_statuses/${uid}`,
  );
  const payload: MemberSessionStatus = {
    uid,
    status,
    updatedAt: Timestamp.now(),
    ...(status === 'late' && lateMinutes ? { lateMinutes } : {}),
  };
  await setDoc(statusRef, payload, { merge: true });
}
