/**
 * Exercise History Service
 *
 * Provides persistent, per-exercise rep history stored in Firestore.
 * Collection path: users/{userId}/exerciseHistory/{exerciseId}
 *
 * Each document is overwritten on every session — we only need the LAST session.
 * This keeps reads O(1) per exercise (a single getDoc, no queries needed).
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkoutExerciseResult } from '@/features/user/core/types/progression.types';

// ── Types ──────────────────────────────────────────────────────────────────

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

const SUB_COLLECTION = 'exerciseHistory';

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Persists per-exercise rep results to Firestore after a workout completes.
 * Each exercise doc is upserted (last-write wins — we only care about the most recent session).
 * This is fire-and-forget safe; errors are swallowed so they never block the completion flow.
 */
export async function saveExerciseHistory(
  userId: string,
  exercises: WorkoutExerciseResult[],
): Promise<void> {
  if (!userId || exercises.length === 0) return;

  const writes = exercises.map((ex) => {
    const ref = doc(db, 'users', userId, SUB_COLLECTION, ex.exerciseId);
    const entry: ExerciseHistoryEntry = {
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      reps: ex.repsPerSet,
      targetReps: ex.targetReps,
      updatedAt: serverTimestamp(),
    };
    return setDoc(ref, entry);
  });

  await Promise.all(writes);
  console.log(`[ExerciseHistory] Saved ${exercises.length} exercise records for user ${userId}`);
}

// ── Read (single) ──────────────────────────────────────────────────────────

/**
 * Returns the confirmed reps array from the user's most recent session for
 * a specific exercise, or null if no history exists yet.
 */
export async function getLastSessionReps(
  userId: string,
  exerciseId: string,
): Promise<number[] | null> {
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
 */
export async function getHistoryMapForExercises(
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, number[]>> {
  if (!userId || exerciseIds.length === 0) return {};

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
    console.log(`[ExerciseHistory] Loaded history for ${Object.keys(map).length}/${exerciseIds.length} exercises`);
    return map;
  } catch (e) {
    console.warn('[ExerciseHistory] getHistoryMapForExercises failed:', e);
    return {};
  }
}
