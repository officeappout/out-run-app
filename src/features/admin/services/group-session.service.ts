/**
 * Group Session Service
 * Manages the group_sessions Firestore collection — links multiple users
 * into a shared workout on the same route.
 *
 * Firestore: group_sessions/{groupSessionId}
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  GroupSession,
  GroupSessionStatus,
} from '@/types/community.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';

const COLLECTION = 'group_sessions';
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const MEMBER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F472B6',
  '#34D399', '#FB923C', '#60A5FA', '#E879F9', '#FBBF24',
  '#22D3EE', '#F87171',
];

function toDate(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date();
}

function normalizeGroupSession(docId: string, data: any): GroupSession {
  return {
    id: docId,
    routeId: data.routeId ?? '',
    activityType: data.activityType ?? 'running',
    leaderUserId: data.leaderUserId ?? '',
    leaderName: data.leaderName ?? '',
    startTime: toDate(data.startTime),
    status: data.status ?? 'forming',
    memberIds: data.memberIds ?? [],
    memberCount: data.memberCount ?? 0,
    memberColors: data.memberColors ?? {},
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export interface CreateGroupSessionInput {
  routeId: string;
  activityType: ActivityType;
  leaderUserId: string;
  leaderName: string;
  startTime: Date;
}

export async function createGroupSession(
  input: CreateGroupSessionInput,
): Promise<GroupSession> {
  const expiresAt = new Date(input.startTime.getTime() + DEFAULT_TTL_MS);
  const memberColors: Record<string, string> = {
    [input.leaderUserId]: '#00BAF7', // leader keeps Out-Blue
  };

  const docRef = await addDoc(collection(db, COLLECTION), {
    routeId: input.routeId,
    activityType: input.activityType,
    leaderUserId: input.leaderUserId,
    leaderName: input.leaderName,
    startTime: Timestamp.fromDate(input.startTime),
    status: 'forming' as GroupSessionStatus,
    memberIds: [input.leaderUserId],
    memberCount: 1,
    memberColors,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
  });

  return normalizeGroupSession(docRef.id, {
    ...input,
    startTime: input.startTime,
    status: 'forming',
    memberIds: [input.leaderUserId],
    memberCount: 1,
    memberColors,
    createdAt: new Date(),
    expiresAt,
  });
}

export async function joinGroupSession(
  groupSessionId: string,
  userId: string,
): Promise<string> {
  const ref = doc(db, COLLECTION, groupSessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Group session not found');

  const data = snap.data();
  const existingMembers: string[] = data.memberIds ?? [];
  if (existingMembers.includes(userId)) return groupSessionId;

  const colorIndex = existingMembers.length % MEMBER_COLORS.length;
  const assignedColor = MEMBER_COLORS[colorIndex];

  await updateDoc(ref, {
    memberIds: arrayUnion(userId),
    memberCount: increment(1),
    [`memberColors.${userId}`]: assignedColor,
  });

  return assignedColor;
}

export async function leaveGroupSession(
  groupSessionId: string,
  userId: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, groupSessionId);
  await updateDoc(ref, {
    memberIds: arrayRemove(userId),
    memberCount: increment(-1),
  });
}

export async function completeGroupSession(
  groupSessionId: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, groupSessionId);
  await updateDoc(ref, {
    status: 'completed' as GroupSessionStatus,
  });
}

export async function activateGroupSession(
  groupSessionId: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, groupSessionId);
  await updateDoc(ref, {
    status: 'active' as GroupSessionStatus,
  });
}

export async function getGroupSession(
  groupSessionId: string,
): Promise<GroupSession | null> {
  const snap = await getDoc(doc(db, COLLECTION, groupSessionId));
  if (!snap.exists()) return null;
  return normalizeGroupSession(snap.id, snap.data());
}

// ─── Real-time listener ──────────────────────────────────────────────────────

export function subscribeToGroupSession(
  groupSessionId: string,
  callback: (session: GroupSession | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, groupSessionId),
    (snap) => {
      if (!snap.exists()) { callback(null); return; }
      callback(normalizeGroupSession(snap.id, snap.data()));
    },
    () => callback(null),
  );
}
