/**
 * Planned Sessions Service
 * Ephemeral "I'm heading to this route" social layer.
 * Firestore collection: planned_sessions/{sessionId}
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  PlannedSession,
  PlannedSessionStatus,
  PrivacyMode,
  FitnessLevel,
} from '@/types/community.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';

const COLLECTION = 'planned_sessions';

function toDate(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date();
}

function normalizeSession(docId: string, data: any): PlannedSession {
  return {
    id: docId,
    userId: data.userId ?? '',
    displayName: data.displayName ?? '',
    photoURL: data.photoURL ?? null,
    routeId: data.routeId ?? '',
    activityType: data.activityType ?? 'running',
    level: data.level ?? 'beginner',
    startTime: toDate(data.startTime),
    expiresAt: toDate(data.expiresAt),
    status: data.status ?? 'planned',
    privacyMode: data.privacyMode ?? 'squad',
    createdAt: toDate(data.createdAt),
    groupSessionId: data.groupSessionId ?? undefined,
    groupName: data.groupName ?? undefined,
    isGroupLeader: data.isGroupLeader ?? undefined,
  };
}

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface CreatePlannedSessionInput {
  userId: string;
  displayName: string;
  photoURL?: string | null;
  routeId: string;
  activityType: ActivityType;
  level: FitnessLevel;
  startTime: Date;
  privacyMode: PrivacyMode;
}

export async function createPlannedSession(
  input: CreatePlannedSessionInput,
): Promise<string> {
  const expiresAt = new Date(input.startTime.getTime() + DEFAULT_TTL_MS);
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId: input.userId,
    displayName: input.displayName,
    photoURL: input.photoURL ?? null,
    routeId: input.routeId,
    activityType: input.activityType,
    level: input.level,
    startTime: Timestamp.fromDate(input.startTime),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: 'planned' as PlannedSessionStatus,
    privacyMode: input.privacyMode,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSessionStatus(
  sessionId: string,
  status: PlannedSessionStatus,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, sessionId), { status });
}

export async function cancelPlannedSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, sessionId), {
    status: 'cancelled' as PlannedSessionStatus,
  });
}

export async function deletePlannedSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, sessionId));
}

/**
 * Batch-fetch planned sessions for a set of route IDs.
 * Firestore `in` queries are capped at 30 values — this handles chunking.
 */
export async function getSessionsForRoutes(
  routeIds: string[],
): Promise<PlannedSession[]> {
  if (routeIds.length === 0) return [];
  const now = Timestamp.now();
  const results: PlannedSession[] = [];

  for (let i = 0; i < routeIds.length; i += 30) {
    const chunk = routeIds.slice(i, i + 30);
    const q = query(
      collection(db, COLLECTION),
      where('routeId', 'in', chunk),
      where('expiresAt', '>=', now),
      orderBy('startTime', 'asc'),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => results.push(normalizeSession(d.id, d.data())));
  }

  return results.filter((s) => s.status !== 'cancelled');
}

/**
 * Fetch all upcoming sessions for a single user (profile view).
 */
export async function getUserSessions(
  userId: string,
): Promise<PlannedSession[]> {
  const now = Timestamp.now();
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('expiresAt', '>=', now),
    orderBy('startTime', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeSession(d.id, d.data()));
}

/**
 * Real-time listener for sessions on a set of routes (for Partner Hub live tab).
 * Returns an unsubscribe function.
 */
export function subscribeToRouteSessions(
  routeIds: string[],
  callback: (sessions: PlannedSession[]) => void,
): Unsubscribe {
  if (routeIds.length === 0) {
    callback([]);
    return () => {};
  }

  const capped = routeIds.slice(0, 30);
  const now = Timestamp.now();
  const q = query(
    collection(db, COLLECTION),
    where('routeId', 'in', capped),
    where('expiresAt', '>=', now),
    orderBy('startTime', 'asc'),
  );

  return onSnapshot(q, (snap) => {
    const sessions = snap.docs
      .map((d) => normalizeSession(d.id, d.data()))
      .filter((s) => s.status !== 'cancelled');
    callback(sessions);
  });
}
