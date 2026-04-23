/**
 * Exercise History Service
 *
 * Provides persistent, per-exercise rep history stored in Firestore.
 *
 * ── Dual-write model ────────────────────────────────────────────────────────
 *
 * Write 1 — "Last session" document (unchanged from original):
 *   Path: users/{uid}/exerciseHistory/{exerciseId}
 *   Semantics: overwritten every session (setDoc). Used by StrengthRunner
 *   to pre-fill the default reps for the next workout. O(1) read per exercise.
 *
 * Write 2 — Time-series session (new):
 *   Path: users/{uid}/exerciseHistory/{exerciseId}/sessions/{auto-id}
 *   Semantics: append-only (addDoc). One document per workout session.
 *   Used by getExerciseTrend() to power profile-dashboard charts.
 *
 * Both writes happen in parallel inside saveExerciseHistory().
 * All existing read functions (getLastSessionReps, getHistoryMapForExercises)
 * are unchanged — they still read from the top-level document only.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkoutExerciseResult } from '@/features/user/core/types/progression.types';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Shape of the top-level "last session" document.
 * Path: users/{uid}/exerciseHistory/{exerciseId}
 * Unchanged from original — preserves backward compatibility.
 */
export interface ExerciseHistoryEntry {
  exerciseId: string;
  exerciseName: string;
  /** Confirmed reps for each set in the most recent session */
  reps: number[];
  /** Target reps that were set for that session */
  targetReps: number;
  /** Firestore server timestamp */
  updatedAt: unknown;
}

/**
 * Shape of one session document in the time-series sub-collection.
 * Path: users/{uid}/exerciseHistory/{exerciseId}/sessions/{auto-id}
 *
 * Designed for direct use as a Recharts data point:
 *   { date, maxReps, totalVolume, maxWeight, targetReps, exerciseName }
 */
export interface ExerciseSessionEntry {
  /** Firestore server timestamp — primary sort key */
  date: unknown;
  /** Confirmed reps per set (e.g. [12, 10, 9]) */
  reps: number[];
  /** Highest single-set rep count — primary Y-axis for bar charts */
  maxReps: number;
  /** Sum of all reps across sets — secondary chart metric (training load) */
  totalVolume: number;
  /**
   * Maximum weight used (kg).
   * Default 0 for bodyweight exercises.
   * Field is present now so the chart layer never needs a schema change
   * when weighted tracking is added.
   */
  maxWeight: number;
  /** Target rep count set for this session — enables "achievement %" overlay */
  targetReps: number;
  /** Denormalized exercise name — avoids a JOIN at query time */
  exerciseName: string;
}

const SUB_COLLECTION = 'exerciseHistory';
const SESSIONS_SUB = 'sessions';

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Persists per-exercise rep results to Firestore after a workout completes.
 *
 * Performs TWO writes per exercise in parallel:
 *   1. setDoc on the top-level document (overwrite — fast-path for next workout)
 *   2. addDoc to the sessions sub-collection (append — for chart history)
 *
 * This is fire-and-forget safe; errors are swallowed so they never block
 * the workout completion flow.
 */
export async function saveExerciseHistory(
  userId: string,
  exercises: WorkoutExerciseResult[],
): Promise<void> {
  if (!userId || exercises.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[ExerciseHistory] Offline — skipping save');
    return;
  }

  const writes = exercises.flatMap((ex) => {
    // ── Write 1: overwrite the "last session" document (original behavior) ──
    const lastSessionRef = doc(db, 'users', userId, SUB_COLLECTION, ex.exerciseId);
    const lastSessionEntry: ExerciseHistoryEntry = {
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      reps: ex.repsPerSet,
      targetReps: ex.targetReps,
      updatedAt: serverTimestamp(),
    };
    const lastSessionWrite = setDoc(lastSessionRef, lastSessionEntry);

    // ── Write 2: append to the time-series sub-collection (new) ──
    const sessionsColRef = collection(
      db,
      'users', userId,
      SUB_COLLECTION, ex.exerciseId,
      SESSIONS_SUB,
    );
    const sessionEntry: ExerciseSessionEntry = {
      date: serverTimestamp(),
      reps: ex.repsPerSet,
      maxReps: ex.repsPerSet.length > 0 ? Math.max(...ex.repsPerSet) : 0,
      totalVolume: ex.repsPerSet.reduce((sum, r) => sum + r, 0),
      maxWeight: 0,
      targetReps: ex.targetReps,
      exerciseName: ex.exerciseName,
    };
    const sessionWrite = addDoc(sessionsColRef, sessionEntry);

    return [lastSessionWrite, sessionWrite];
  });

  await Promise.all(writes);
  console.log(
    `[ExerciseHistory] Dual-write complete: ${exercises.length} exercises` +
    ` (last-session overwrite + sessions append) for user ${userId}`,
  );
}

// ── Read (single) ──────────────────────────────────────────────────────────

/**
 * Returns the confirmed reps array from the user's most recent session for
 * a specific exercise, or null if no history exists yet.
 * Reads from the top-level "last session" document — O(1), unchanged.
 */
export async function getLastSessionReps(
  userId: string,
  exerciseId: string,
): Promise<number[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const ref = doc(db, 'users', userId, SUB_COLLECTION, exerciseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as ExerciseHistoryEntry;
    return data.reps ?? null;
  } catch (e) {
    console.warn('[ExerciseHistory] getLastSessionReps failed:', e);
    return null;
  }
}

// ── Read (batch) ───────────────────────────────────────────────────────────

/**
 * Fetches history for a specific list of exercise IDs in one batched read.
 * Returns a map of exerciseId → last-session reps array.
 * Missing exercises are simply absent from the map.
 * Reads from top-level documents only — unchanged.
 */
export async function getHistoryMapForExercises(
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, number[]>> {
  if (!userId || exerciseIds.length === 0) return {};
  if (typeof navigator !== 'undefined' && !navigator.onLine) return {};

  try {
    const reads = exerciseIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'users', userId, SUB_COLLECTION, id));
      if (!snap.exists()) return null;
      const data = snap.data() as ExerciseHistoryEntry;
      return { id, reps: data.reps };
    });

    const results = await Promise.all(reads);
    const map: Record<string, number[]> = {};
    for (const r of results) {
      if (r && r.reps?.length > 0) map[r.id] = r.reps;
    }
    console.log(
      `[ExerciseHistory] Loaded history for ${Object.keys(map).length}/${exerciseIds.length} exercises`,
    );
    return map;
  } catch (e) {
    console.warn('[ExerciseHistory] getHistoryMapForExercises failed:', e);
    return {};
  }
}

// ── Read (time-series) ─────────────────────────────────────────────────────

/**
 * Fetch the last N sessions for a specific exercise, ordered chronologically
 * (oldest → newest), ready for use as Recharts chart data.
 *
 * Returns an empty array when:
 *   - The user is offline
 *   - The sessions sub-collection doesn't exist yet (new users / pre-upgrade)
 *   - A Firestore error occurs
 *
 * No Firestore composite index is required — single-field orderBy on 'date'
 * is supported automatically.
 *
 * @param userId     Firestore user ID
 * @param exerciseId The exercise document ID (e.g., 'pullup')
 * @param limit      Number of most-recent sessions to return (default: 8)
 *
 * @example
 * const trend = await getExerciseTrend(userId, 'pullup', 8);
 * const chartData = trend.map((s, i) => ({
 *   session: i + 1,
 *   maxReps: s.maxReps,
 *   totalVolume: s.totalVolume,
 * }));
 */
export async function getExerciseTrend(
  userId: string,
  exerciseId: string,
  limit: number = 8,
): Promise<ExerciseSessionEntry[]> {
  if (!userId || !exerciseId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const sessionsRef = collection(
      db,
      'users', userId,
      SUB_COLLECTION, exerciseId,
      SESSIONS_SUB,
    );
    const q = query(sessionsRef, orderBy('date', 'desc'), firestoreLimit(limit));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    // Reverse to chronological order (oldest → newest) for chart x-axis
    const entries = snap.docs
      .map(d => d.data() as ExerciseSessionEntry)
      .reverse();

    console.log(
      `[ExerciseHistory] getExerciseTrend: ${entries.length} sessions for exercise "${exerciseId}"`,
    );
    return entries;
  } catch (e) {
    console.warn('[ExerciseHistory] getExerciseTrend failed:', e);
    return [];
  }
}

/**
 * Fetch the COMPLETE session history for one exercise (no limit).
 * Ordered chronologically oldest → newest for chart rendering.
 *
 * Used by ExerciseAnalyticsPage for the full progress timeline.
 */
export async function getExerciseFullHistory(
  userId: string,
  exerciseId: string,
): Promise<ExerciseSessionEntry[]> {
  if (!userId || !exerciseId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const sessionsRef = collection(
      db,
      'users', userId,
      SUB_COLLECTION, exerciseId,
      SESSIONS_SUB,
    );
    // No limit — fetch all sessions, newest first, then reverse
    const q = query(sessionsRef, orderBy('date', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    return snap.docs
      .map((d) => ({ ...d.data(), _id: d.id } as ExerciseSessionEntry & { _id: string }))
      .reverse();
  } catch (e) {
    console.warn('[ExerciseHistory] getExerciseFullHistory failed:', e);
    return [];
  }
}

// ── Read (full history, unbounded) ─────────────────────────────────────────

/**
 * One session entry augmented with a plain millisecond timestamp so
 * client code can do date arithmetic without importing Firestore types.
 */
export interface RichExerciseSession extends ExerciseSessionEntry {
  /** Epoch ms derived from the Firestore Timestamp stored in `date`. */
  dateMs: number;
}

/**
 * Pre-computed analytics derived from the exercise's full session history.
 * All heavy lifting happens server-side inside `getExerciseAnalytics` so
 * the component layer stays trivially simple.
 */
export interface ExerciseAnalytics {
  /** All sessions for this exercise, sorted oldest → newest. */
  sessions: RichExerciseSession[];
  /** Highest `maxReps` value ever recorded. */
  personalBest: number;
  /** Sum of every `totalVolume` across all sessions. */
  cumulativeVolume: number;
  /**
   * Percentage change from the first to the most-recent session.
   * `null` when there are fewer than 2 sessions.
   */
  improvementPct: number | null;
  /** `targetReps` from the most recent session — used for the chart reference line. */
  latestTargetReps: number | null;
}

/**
 * Fetches the COMPLETE session history for one exercise (no limit) and
 * returns both the raw sessions and pre-computed stats.
 *
 * Intentionally skips `firestoreLimit` so the analytics page always
 * reflects 100 % of the user's data — unlike `getExerciseTrend` which
 * is capped for dashboard thumbnails.
 */
export async function getExerciseAnalytics(
  userId: string,
  exerciseId: string,
): Promise<ExerciseAnalytics> {
  const empty: ExerciseAnalytics = {
    sessions: [],
    personalBest: 0,
    cumulativeVolume: 0,
    improvementPct: null,
    latestTargetReps: null,
  };

  if (!userId || !exerciseId) return empty;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return empty;

  try {
    const sessionsRef = collection(
      db,
      'users', userId,
      SUB_COLLECTION, exerciseId,
      SESSIONS_SUB,
    );
    // Fetch all docs ordered chronologically — no limit intentionally.
    const q = query(sessionsRef, orderBy('date', 'asc'));
    const snap = await getDocs(q);

    if (snap.empty) return empty;

    const sessions: RichExerciseSession[] = snap.docs.map((d) => {
      const raw = d.data() as ExerciseSessionEntry;
      // Firestore Timestamp → milliseconds for client-side date arithmetic.
      const ts = raw.date as { toMillis?: () => number; seconds?: number } | null;
      const dateMs =
        ts?.toMillis?.() ??
        (ts?.seconds != null ? ts.seconds * 1000 : Date.now());
      return { ...raw, dateMs };
    });

    const personalBest = Math.max(...sessions.map((s) => s.maxReps));
    const cumulativeVolume = sessions.reduce((sum, s) => sum + s.totalVolume, 0);
    const first = sessions[0].maxReps;
    const last = sessions[sessions.length - 1].maxReps;
    const improvementPct =
      sessions.length >= 2 && first > 0
        ? Math.round(((last - first) / first) * 100)
        : null;
    // Treat targetReps ≤ 1 as "not set" — the HorizontalPicker defaults to 1
    // when no program target exists, so we never want to show that as a goal.
    const rawTarget = sessions[sessions.length - 1].targetReps;
    const latestTargetReps = typeof rawTarget === 'number' && rawTarget > 1 ? rawTarget : null;

    console.log(
      `[ExerciseHistory] getExerciseAnalytics: ${sessions.length} sessions for "${exerciseId}"`,
    );

    return { sessions, personalBest, cumulativeVolume, improvementPct, latestTargetReps };
  } catch (e) {
    console.warn('[ExerciseHistory] getExerciseAnalytics failed:', e);
    return empty;
  }
}

/**
 * Returns the exercise IDs the user has trained most recently, sorted by
 * `updatedAt` descending.  Reads the top-level `exerciseHistory` documents
 * (one per exercise) — lightweight, no sub-collection reads.
 *
 * Used by the Dashboard to populate fallback charts with real data instead
 * of a hardcoded 'pullup' exercise ID that may not exist.
 */
export async function getRecentExerciseIds(
  userId: string,
  max: number = 2,
): Promise<{ exerciseId: string; exerciseName: string }[]> {
  if (!userId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const colRef = collection(db, 'users', userId, SUB_COLLECTION);
    const q = query(colRef, orderBy('updatedAt', 'desc'), firestoreLimit(max));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    return snap.docs.map((d) => ({
      exerciseId: d.id,
      exerciseName: (d.data() as ExerciseHistoryEntry).exerciseName || d.id,
    }));
  } catch (e) {
    console.warn('[ExerciseHistory] getRecentExerciseIds failed:', e);
    return [];
  }
}
