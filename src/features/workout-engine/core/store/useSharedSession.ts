'use client';

import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computePhase } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { LiveSessionPhase, SessionAttendance } from '@/types/community.types';

// How the session was entered.
// Used by lobby UI and analytics — does not affect core session logic.
export type SessionEntryMethod = 'banner' | 'deep-link';

// Identifies which Firestore model backs the current session.
// Reserved field; only 'attendance' is used in v1.
export type SessionRef =
  | { model: 'attendance'; groupId: string; attendanceId: string }
  | { model: 'group_session'; sessionId: string };

type AttendeeProfiles = Record<string, { name: string; photoURL?: string }>;

interface SharedSessionState {
  groupId: string | null;
  groupName: string | null;
  /** Attendance doc key: "YYYY-MM-DD_HH-mm" */
  attendanceId: string | null;
  memberIds: string[];
  attendeeProfiles: AttendeeProfiles;
  phase: LiveSessionPhase | null;
  entryMethod: SessionEntryMethod | null;
  sessionRef: SessionRef | null;

  startGroupSession: (
    groupId: string,
    attendanceId: string,
    memberIds: string[],
    attendeeProfiles: AttendeeProfiles,
    groupName: string,
  ) => void;
  /** Same as startGroupSession but marks entryMethod as 'deep-link'. */
  joinViaDeepLink: (
    groupId: string,
    attendanceId: string,
    memberIds: string[],
    attendeeProfiles: AttendeeProfiles,
    groupName: string,
  ) => void;
  clearGroupSession: () => void;
}

// Module-level unsubscribe ref — replaced on every startGroupSession call.
let _unsub: (() => void) | null = null;

function parseMinutesUntil(attendanceId: string): number {
  // attendanceId format: "YYYY-MM-DD_HH-mm"
  const [datePart, timePart] = attendanceId.split('_');
  if (!datePart || !timePart) return 0;
  const [hh, mm] = timePart.split('-').map(Number);
  const sessionDate = new Date(`${datePart}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
  return (sessionDate.getTime() - Date.now()) / 60_000;
}

// Shared subscription logic — called by both startGroupSession and joinViaDeepLink.
function subscribeToAttendance(
  groupId: string,
  attendanceId: string,
  seedMemberIds: string[],
  seedProfiles: AttendeeProfiles,
  set: (partial: Partial<SharedSessionState>) => void,
): () => void {
  const docRef = doc(db, 'community_groups', groupId, 'attendance', attendanceId);
  return onSnapshot(
    docRef,
    (snap) => {
      const attendance = snap.exists() ? (snap.data() as SessionAttendance) : undefined;
      const minutesUntil = parseMinutesUntil(attendanceId);
      const phase = computePhase(minutesUntil, attendance, 60);

      const memberIds = attendance?.attendees?.length ? attendance.attendees : seedMemberIds;
      const attendeeProfiles = attendance?.attendeeProfiles ?? seedProfiles;

      set({ phase, memberIds, attendeeProfiles });
      console.debug('[SharedSession] phase:', phase, 'members:', memberIds.length);
    },
    (err) => {
      console.warn('[SharedSession] onSnapshot error:', err);
    },
  );
}

export const useSharedSession = create<SharedSessionState>((set) => ({
  groupId: null,
  groupName: null,
  attendanceId: null,
  memberIds: [],
  attendeeProfiles: {},
  phase: null,
  entryMethod: null,
  sessionRef: null,

  startGroupSession(groupId, attendanceId, memberIds, attendeeProfiles, groupName) {
    _unsub?.();
    _unsub = null;

    set({
      groupId,
      groupName,
      attendanceId,
      memberIds,
      attendeeProfiles,
      phase: null,
      entryMethod: 'banner',
      sessionRef: { model: 'attendance', groupId, attendanceId },
    });

    _unsub = subscribeToAttendance(groupId, attendanceId, memberIds, attendeeProfiles, set);
  },

  joinViaDeepLink(groupId, attendanceId, memberIds, attendeeProfiles, groupName) {
    _unsub?.();
    _unsub = null;

    set({
      groupId,
      groupName,
      attendanceId,
      memberIds,
      attendeeProfiles,
      phase: null,
      entryMethod: 'deep-link',
      sessionRef: { model: 'attendance', groupId, attendanceId },
    });

    _unsub = subscribeToAttendance(groupId, attendanceId, memberIds, attendeeProfiles, set);
  },

  clearGroupSession() {
    _unsub?.();
    _unsub = null;
    set({
      groupId: null,
      groupName: null,
      attendanceId: null,
      memberIds: [],
      attendeeProfiles: {},
      phase: null,
      entryMethod: null,
      sessionRef: null,
    });
  },
}));
