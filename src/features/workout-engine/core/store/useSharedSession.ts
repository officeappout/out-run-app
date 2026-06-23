'use client';

import { create } from 'zustand';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { computePhase } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { LiveSessionPhase, MemberSessionStatus, SessionAttendance, SessionGoalSpec } from '@/types/community.types';

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

  /**
   * Session-level goal set by the creator (read from SessionAttendance.sessionGoal).
   * Updated whenever the attendance onSnapshot fires.
   * undefined = attendance doc not yet loaded or no goal defined.
   */
  sessionGoal: SessionGoalSpec | undefined;

  /**
   * Current member's personal goal override (read from member_statuses/{uid}).
   * Fetched once at session start via getDoc.
   * undefined = no member_statuses doc or not yet fetched (→ inherit sessionGoal).
   * null      = explicit "no goal" (solo mode, case A).
   */
  myPersonalGoal: SessionGoalSpec | null | undefined;

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

      set({ phase, memberIds, attendeeProfiles, sessionGoal: attendance?.sessionGoal });
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
  sessionGoal: undefined,
  myPersonalGoal: undefined,

  startGroupSession(groupId, attendanceId, memberIds, attendeeProfiles, groupName) {
    _unsub?.();
    _unsub = null;

    // Seed phase optimistically so SessionLobbyOverlay appears immediately on /map
    // before the Firestore onSnapshot fires. The snapshot will confirm or correct it.
    const optimisticPhase = computePhase(parseMinutesUntil(attendanceId), undefined, 60);

    set({
      groupId,
      groupName,
      attendanceId,
      memberIds,
      attendeeProfiles,
      phase: optimisticPhase,
      entryMethod: 'banner',
      sessionRef: { model: 'attendance', groupId, attendanceId },
    });

    _unsub = subscribeToAttendance(groupId, attendanceId, memberIds, attendeeProfiles, set);

    const uid = auth.currentUser?.uid;
    if (uid) {
      getDoc(doc(db, `community_groups/${groupId}/attendance/${attendanceId}/member_statuses/${uid}`))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data() as MemberSessionStatus;
            set({ myPersonalGoal: data.personalGoal });
          } else {
            set({ myPersonalGoal: undefined });
          }
        })
        .catch(() => { /* non-fatal — undefined means inherit */ });
    }
  },

  joinViaDeepLink(groupId, attendanceId, memberIds, attendeeProfiles, groupName) {
    _unsub?.();
    _unsub = null;

    const optimisticPhase = computePhase(parseMinutesUntil(attendanceId), undefined, 60);

    set({
      groupId,
      groupName,
      attendanceId,
      memberIds,
      attendeeProfiles,
      phase: optimisticPhase,
      entryMethod: 'deep-link',
      sessionRef: { model: 'attendance', groupId, attendanceId },
    });

    _unsub = subscribeToAttendance(groupId, attendanceId, memberIds, attendeeProfiles, set);

    const uid = auth.currentUser?.uid;
    if (uid) {
      getDoc(doc(db, `community_groups/${groupId}/attendance/${attendanceId}/member_statuses/${uid}`))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data() as MemberSessionStatus;
            set({ myPersonalGoal: data.personalGoal });
          } else {
            set({ myPersonalGoal: undefined });
          }
        })
        .catch(() => { /* non-fatal — undefined means inherit */ });
    }
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
      sessionGoal: undefined,
      myPersonalGoal: undefined,
    });
  },
}));
