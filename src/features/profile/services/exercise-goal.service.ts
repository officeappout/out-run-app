/**
 * Exercise Goal Service
 *
 * Persists a user's personal target (goal) for a specific exercise.
 * Deliberately separate from:
 *   - `exerciseHistory` sessions (the workout runner's per-session data)
 *   - The program track / `useProgressionStore` (admin-managed progression)
 *
 * ── Firestore path ───────────────────────────────────────────────────────────
 *   users/{uid}/customGoals/{exerciseId}
 *   Document fields: { targetReps: number, updatedAt: Timestamp }
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const SUB = 'customGoals';

/**
 * Reads the user's personal goal for one exercise.
 * Returns `null` if no goal has been set or the value is invalid.
 */
export async function getCustomGoal(
  userId: string,
  exerciseId: string,
): Promise<number | null> {
  if (!userId || !exerciseId) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId, SUB, exerciseId));
    if (!snap.exists()) return null;
    const val = snap.data()?.targetReps;
    return typeof val === 'number' && val > 0 ? val : null;
  } catch (e) {
    console.warn('[ExerciseGoal] getCustomGoal failed:', e);
    return null;
  }
}

/**
 * Writes (or overwrites) the user's personal goal for one exercise.
 * Uses `setDoc` with merge so concurrent writes from other sessions are safe.
 */
export async function saveCustomGoal(
  userId: string,
  exerciseId: string,
  targetReps: number,
): Promise<void> {
  if (!userId || !exerciseId || targetReps <= 0) return;
  await setDoc(
    doc(db, 'users', userId, SUB, exerciseId),
    { targetReps, updatedAt: serverTimestamp() },
    { merge: true },
  );
  console.log(
    `[ExerciseGoal] Goal saved: exercise="${exerciseId}" targetReps=${targetReps}`,
  );
}
