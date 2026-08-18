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
import { geohashForLocation } from 'geofire-common';
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

/** Default arrival-window length when callers don't pass an explicit `endTime`. */
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function normalizeSession(docId: string, data: any): PlannedSession {
  const startTime = toDate(data.startTime);
  // Older docs predate `endTime`. Fall back to a 1-hour window so
  // consumers can always render a range without having to re-check
  // for `endTime` themselves. The `Math.max` guards against the rare
  // case where a doc was written with `endTime <= startTime` (e.g.
  // legacy mock seeders): we never want to advertise a window that
  // ends before it began.
  const rawEnd = data.endTime ? toDate(data.endTime) : null;
  const endTime =
    rawEnd && rawEnd.getTime() > startTime.getTime()
      ? rawEnd
      : new Date(startTime.getTime() + DEFAULT_WINDOW_MS);
  return {
    id: docId,
    userId: data.userId ?? '',
    displayName: data.displayName ?? '',
    photoURL: data.photoURL ?? null,
    // routeId / parkId are mutually exclusive — preserve only the one
    // that's actually present so consumers can branch on its existence.
    ...(typeof data.routeId === 'string' && data.routeId.length > 0
      ? { routeId: data.routeId }
      : {}),
    ...(typeof data.parkId === 'string' && data.parkId.length > 0
      ? { parkId: data.parkId }
      : {}),
    ...(typeof data.parkName === 'string' && data.parkName.length > 0
      ? { parkName: data.parkName }
      : {}),
    ...(typeof data.routeName === 'string' && data.routeName.length > 0
      ? { routeName: data.routeName }
      : {}),
    ...(typeof data.programName === 'string' && data.programName.length > 0
      ? { programName: data.programName }
      : {}),
    ...(typeof data.programLevel === 'number'
      ? { programLevel: data.programLevel }
      : {}),
    activityType: data.activityType ?? 'running',
    // No fallback to 'beginner' — a missing level means "not applicable"
    // (running/walking today), not "unknown beginner". See the field's
    // doc comment on `PlannedSession` in community.types.ts.
    ...(typeof data.level === 'string' ? { level: data.level as FitnessLevel } : {}),
    startTime,
    endTime,
    expiresAt: toDate(data.expiresAt),
    status: data.status ?? 'planned',
    privacyMode: data.privacyMode ?? 'squad',
    createdAt: toDate(data.createdAt),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    ...(typeof data.geohash === 'string' ? { geohash: data.geohash } : {}),
    groupSessionId: data.groupSessionId ?? undefined,
    groupName: data.groupName ?? undefined,
    isGroupLeader: data.isGroupLeader ?? undefined,
  };
}

/**
 * Grace window kept after `endTime` so partner-finder listeners (which
 * gate on `expiresAt >= now`) keep showing a session for a little while
 * past its declared end. Matches the user-facing intuition of "people
 * are usually still hanging around 30 minutes after they said they'd
 * leave" without leaking ghost sessions for hours.
 */
const EXPIRY_GRACE_MS = 30 * 60 * 1000; // 30 minutes

export interface CreatePlannedSessionInput {
  userId: string;
  displayName: string;
  photoURL?: string | null;
  /** Set when announcing arrival at a route start. Mutually exclusive with `parkId`. */
  routeId?: string;
  /** Set when announcing arrival at a park. Mutually exclusive with `routeId`. */
  parkId?: string;
  /** Display name of the park (denormalised — see `PlannedSession.parkName`). */
  parkName?: string;
  /** Display name of the route (denormalised — see `PlannedSession.routeName`). */
  routeName?: string;
  /** Active program name captured at publish time. */
  programName?: string;
  /** Active program level captured at publish time. */
  programLevel?: number;
  activityType: ActivityType;
  /** Omit for running/walking (no level system yet) — never pass a guessed default. */
  level?: FitnessLevel;
  startTime: Date;
  /**
   * End of the arrival window. When omitted we default to
   * `startTime + DEFAULT_WINDOW_MS` so legacy callsites (e.g. the
   * route arrival sheet, manual workout entry modal) keep working
   * without code changes — but UI surfaces that DO let the user
   * pick a range (ParkDetailSheet) MUST pass an explicit value.
   */
  endTime?: Date;
  privacyMode: PrivacyMode;
  lat?: number | null;
  lng?: number | null;
}

export async function createPlannedSession(
  input: CreatePlannedSessionInput,
): Promise<string> {
  if (!input.routeId && !input.parkId) {
    throw new Error(
      'createPlannedSession: either routeId or parkId must be provided',
    );
  }
  // Resolve the end of the arrival window — guard against bad inputs
  // (endTime ≤ startTime) by clamping to the 1-hour default. This way
  // the doc always has `startTime < endTime` and consumers can render
  // a sane "HH:MM – HH:MM" label even if a callsite gets the math
  // wrong.
  const endTime =
    input.endTime && input.endTime.getTime() > input.startTime.getTime()
      ? input.endTime
      : new Date(input.startTime.getTime() + DEFAULT_WINDOW_MS);
  // Expire a little after the declared end so partner-finder cards
  // don't disappear the instant the window closes.
  const expiresAt = new Date(endTime.getTime() + EXPIRY_GRACE_MS);
  // Geohash the location at write time — Phase 3's radius-based push
  // targeting needs a queryable index from day one; retrofitting it later
  // would mean backfilling every doc created before this field existed.
  // Precision 9 matches the existing parks/routes usage of geofire-common
  // (e.g. route-adjacency.service.ts) so future radius queries share the
  // same bounding-box behavior across domains.
  const geohash =
    input.lat != null && input.lng != null
      ? geohashForLocation([input.lat, input.lng], 9)
      : undefined;
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId: input.userId,
    displayName: input.displayName,
    photoURL: input.photoURL ?? null,
    // Only persist the field that's actually set — the consumer queries
    // (`where('parkId', '==', X)` vs `where('routeId', 'in', [...])`)
    // depend on the irrelevant field being absent, not just empty.
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.parkId ? { parkId: input.parkId } : {}),
    ...(input.parkName ? { parkName: input.parkName } : {}),
    ...(input.routeName ? { routeName: input.routeName } : {}),
    ...(input.programName ? { programName: input.programName } : {}),
    ...(typeof input.programLevel === 'number'
      ? { programLevel: input.programLevel }
      : {}),
    activityType: input.activityType,
    // Omit entirely when not supplied — never write a guessed default.
    // Callers decide per-activity-type whether a level applies (see
    // PlannedActivityComposeSheet's per-type level handling).
    ...(input.level ? { level: input.level } : {}),
    startTime: Timestamp.fromDate(input.startTime),
    endTime: Timestamp.fromDate(endTime),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: 'planned' as PlannedSessionStatus,
    privacyMode: input.privacyMode,
    createdAt: serverTimestamp(),
    ...(input.lat != null && { lat: input.lat }),
    ...(input.lng != null && { lng: input.lng }),
    ...(geohash ? { geohash } : {}),
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

/**
 * One-shot fetch of non-expired planned arrivals at a single park.
 * Mirrors `getSessionsForRoutes` but keyed on `parkId`.
 */
export async function getPlannedSessionsForPark(
  parkId: string,
): Promise<PlannedSession[]> {
  if (!parkId) return [];
  const now = Timestamp.now();
  const q = query(
    collection(db, COLLECTION),
    where('parkId', '==', parkId),
    where('expiresAt', '>=', now),
    orderBy('startTime', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => normalizeSession(d.id, d.data()))
    .filter((s) => s.status !== 'cancelled');
}

/**
 * Real-time listener for arrivals at a single park (ParkDetailSheet).
 * Returns an unsubscribe function.
 */
export function subscribeToParkSessions(
  parkId: string,
  callback: (sessions: PlannedSession[]) => void,
): Unsubscribe {
  if (!parkId) {
    callback([]);
    return () => {};
  }

  const now = Timestamp.now();
  const q = query(
    collection(db, COLLECTION),
    where('parkId', '==', parkId),
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
