/**
 * UserSchedule Service — UTS Phase 1
 *
 * Pure async Firestore service (no React hooks).
 * Collection: 'userSchedule'
 * Document ID: '{userId}_{YYYY-MM-DD}'
 *
 * All functions await Firebase Auth readiness before touching Firestore,
 * preventing "Missing or insufficient permissions" during app startup.
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '../types/schedule.types';
import { getHebrewDayLetter, addDays } from '../utils/dateUtils';

const COLLECTION = 'userSchedule';

const docId = (userId: string, date: string): string => `${userId}_${date}`;

// ── Auth Readiness Gate ────────────────────────────────────────────────────

/** Cached ONLY after a successful auth (user is non-null). */
let _authOk: Promise<void> | null = null;

/**
 * Waits until `auth.currentUser` is a signed-in user.
 *
 * Key design:
 *   • If currentUser is already available → resolve immediately.
 *   • Otherwise listen via `onAuthStateChanged` and resolve once
 *     the callback delivers a non-null user.
 *   • The result is only cached after success. If it times out
 *     (no user after 8 s), it resolves but does NOT cache, so the
 *     next call retries from scratch.
 *   • Also tries Firebase v10+ `authStateReady()` when available.
 */
function waitForAuth(): Promise<void> {
  // Fast path — user already available
  if (auth.currentUser) {
    _authOk = _authOk ?? Promise.resolve();
    return _authOk;
  }

  // If a previous call already succeeded, reuse
  if (_authOk) return _authOk;

  // Create a new attempt
  const attempt = new Promise<void>((resolve) => {
    let settled = false;

    // Firebase v10+ fast-path
    if (typeof (auth as any).authStateReady === 'function') {
      (auth as any).authStateReady().then(() => {
        if (!settled && auth.currentUser) {
          settled = true;
          _authOk = Promise.resolve();
          resolve();
        }
      }).catch(() => {});
    }

    // Standard listener
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && !settled) {
        settled = true;
        unsub();
        _authOk = Promise.resolve();
        resolve();
      }
    });

    // Safety timeout — resolve but do NOT cache so next call retries
    setTimeout(() => {
      if (!settled) {
        settled = true;
        unsub();
        console.warn('[UserSchedule] waitForAuth: timed out after 8 s — no user');
        resolve();
      }
    }, 8_000);
  });

  return attempt;
}

/**
 * Waits for Firebase Auth readiness, then returns the authenticated UID.
 * Callers should use the returned UID for all Firestore operations
 * instead of relying on a UID passed from component props.
 */
async function resolveAuthUid(): Promise<string | null> {
  await waitForAuth();

  const cur = auth.currentUser;
  if (!cur) {
    console.warn('[UserSchedule] resolveAuthUid — no currentUser after waitForAuth');
    return null;
  }
  return cur.uid;
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getScheduleEntry(
  _userId: string,
  date: string,
): Promise<UserScheduleEntry | null> {
  const uid = await resolveAuthUid();
  if (!uid) return null;

  const id = docId(uid, date);
  try {
    const ref = doc(db, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as UserScheduleEntry;
  } catch (err) {
    console.error(`[UserSchedule] READ FAILED  path=${COLLECTION}/${id}  uid=${uid}`, err);
    return null;
  }
}

export async function getWeekEntries(
  _userId: string,
  sundayISO: string,
): Promise<UserScheduleEntry[]> {
  const uid = await resolveAuthUid();
  if (!uid) return [];
  try {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(sundayISO, i));
    const refs = dates.map(d => doc(db, COLLECTION, docId(uid, d)));
    const snaps = await Promise.all(refs.map(r => getDoc(r)));
    return snaps
      .filter(s => s.exists())
      .map(s => s.data() as UserScheduleEntry);
  } catch (err) {
    console.error(`[UserSchedule] getWeekEntries failed for ${uid} week ${sundayISO}:`, err);
    return [];
  }
}

// ── Hydration ──────────────────────────────────────────────────────────────

export async function hydrateFromTemplate(
  _userId: string,
  date: string,
  template: RecurringTemplate,
): Promise<UserScheduleEntry | null> {
  const uid = await resolveAuthUid();
  if (!uid) return null;

  const dayLetter = getHebrewDayLetter(new Date(date + 'T00:00:00'));
  const programIds = template[dayLetter];
  if (!programIds) return null;

  const entry: UserScheduleEntry = {
    userId: uid,
    date,
    programIds,
    type: programIds.length === 0 ? 'rest' : 'training',
    source: 'recurring',
    completed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const id = docId(uid, date);
  try {
    const ref = doc(db, COLLECTION, id);
    await setDoc(ref, entry, { merge: false });
    return entry;
  } catch (err) {
    console.error(`[UserSchedule] HYDRATE FAILED  path=${COLLECTION}/${id}  uid=${uid}`, err);
    return null;
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function upsertScheduleEntry(
  entry: Omit<UserScheduleEntry, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) {
    console.warn('[UserSchedule] upsertScheduleEntry skipped — no authenticated user');
    return;
  }

  const safeEntry = { ...entry, userId: uid };
  const id = docId(uid, safeEntry.date);
  try {
    const ref = doc(db, COLLECTION, id);
    await setDoc(
      ref,
      { ...safeEntry, updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
      { merge: true },
    );
    console.log(`[UserSchedule] WRITE OK  path=${COLLECTION}/${id}`);
  } catch (err) {
    console.error(`[UserSchedule] WRITE FAILED  path=${COLLECTION}/${id}  uid=${uid}`, err);
    throw err;
  }
}

export async function markCompleted(
  _userId: string,
  date: string,
  workoutId: string,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) return;

  const id = docId(uid, date);
  try {
    const ref = doc(db, COLLECTION, id);
    await setDoc(
      ref,
      {
        completed: true,
        completedWorkoutId: workoutId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error(`[UserSchedule] markCompleted FAILED  path=${COLLECTION}/${id}`, err);
  }
}

// ── Drag & Drop — Move entry between dates ────────────────────────────────

/**
 * Move a training entry from one date to another.
 * The source date becomes a rest day (document deleted).
 * The target date receives the training entry with the new date.
 */
export async function moveScheduleEntry(
  _userId: string,
  fromDate: string,
  toDate: string,
): Promise<boolean> {
  if (fromDate === toDate) return false;
  const uid = await resolveAuthUid();
  if (!uid) return false;

  try {
    const source = await getScheduleEntry(uid, fromDate);
    if (!source || source.type !== 'training') return false;

    const moved: UserScheduleEntry = {
      ...source,
      userId: uid,
      date: toDate,
      source: 'manual',
      completed: false,
      completedWorkoutId: undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const toId = docId(uid, toDate);
    const fromId = docId(uid, fromDate);

    await setDoc(doc(db, COLLECTION, toId), moved, { merge: false });

    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, COLLECTION, fromId));

    console.log(`[UserSchedule] MOVED  ${fromDate} → ${toDate}`);
    return true;
  } catch (err) {
    console.error(`[UserSchedule] MOVE FAILED  ${fromDate} → ${toDate}`, err);
    return false;
  }
}
