/**
 * Favorites Firestore Service
 *
 * CRUD for the `users/{uid}/favoriteWorkouts` subcollection.
 */
import {
  collection, addDoc, deleteDoc, doc,
  getDocs, query, orderBy, where, serverTimestamp, limit,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { FavoriteWorkout, FavoriteWorkoutWrite, SharedExercise } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Nuclear-grade sanitiser for Firestore documents.
 * Converts ALL `undefined` values at any depth to `null`.
 *
 * Uses JSON.stringify with a replacer — this is the most reliable approach
 * because JSON.stringify walks every property recursively, including
 * nested objects and arrays, and the replacer intercepts `undefined`
 * before JSON would normally drop the key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => (value === undefined ? null : value)),
  );
}

function resolveImageUrl(ex: GeneratedWorkout['exercises'][number]): string | null {
  const m = ex.method;
  return m?.media?.imageUrl ?? m?.media?.mainVideoUrl
    ?? ex.exercise.media?.imageUrl ?? ex.exercise.media?.videoUrl
    ?? null;
}

function resolveVideoUrl(ex: GeneratedWorkout['exercises'][number]): string | null {
  const m = ex.method;
  return (m as any)?.media?.mainVideoUrl ?? (m as any)?.media?.videoUrl
    ?? ex.exercise.media?.videoUrl ?? (ex.exercise.media as any)?.mainVideoUrl
    ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveText(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return val?.he || val?.male || val?.en || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveTextArray(arr: any[] | undefined | null): string[] | null {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  const resolved = arr.map((v) => resolveText(v)).filter(Boolean) as string[];
  return resolved.length > 0 ? resolved : null;
}

function serializeExercises(workout: GeneratedWorkout): SharedExercise[] {
  return workout.exercises.map((ex) => {
    const raw = ex.repsRange;
    const repsRange =
      raw && typeof raw.min === 'number' && typeof raw.max === 'number'
        ? { min: raw.min, max: raw.max }
        : null;

    const exercise = ex.exercise as any;
    const method = ex.method as any;

    return {
      exerciseId: exercise.id ?? '',
      name: typeof exercise.name === 'string'
        ? exercise.name
        : exercise.name?.he || exercise.name?.en || exercise.id || '',
      sets: ex.sets ?? 0,
      reps: ex.reps ?? 0,
      repsRange,
      isTimeBased: ex.isTimeBased ?? false,
      restSeconds: ex.restSeconds ?? 0,
      imageUrl: resolveImageUrl(ex),
      videoUrl: resolveVideoUrl(ex),
      primaryMuscle: exercise.primaryMuscle ?? null,
      exerciseRole: ex.exerciseRole ?? exercise.exerciseRole ?? 'main',
      pairedWith: ex.pairedWith ?? null,

      secondaryMuscles: exercise.secondaryMuscles?.filter(Boolean) ?? null,
      symmetry: exercise.symmetry ?? null,
      movementGroup: exercise.movementGroup ?? null,
      instructions: resolveText(exercise.content?.instructions),
      description: resolveText(exercise.content?.description),
      specificCues: resolveTextArray(exercise.content?.specificCues),
      goal: resolveText(exercise.content?.goal),
      notes: resolveTextArray(exercise.content?.notes),
      highlights: resolveTextArray(exercise.content?.highlights),
      methodCues: resolveTextArray(method?.specificCues),
      methodHighlights: resolveTextArray(method?.highlights),
      notificationText: resolveText(method?.notificationText),
    };
  });
}

function extractEquipment(workout: GeneratedWorkout): string[] {
  const s = new Set<string>();
  for (const ex of workout.exercises) {
    for (const id of [...(ex.method?.gearIds ?? []), ...(ex.method?.equipmentIds ?? [])]) {
      if (id) s.add(id);
    }
  }
  return Array.from(s);
}

function extractMuscles(workout: GeneratedWorkout): string[] {
  const s = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exercise.primaryMuscle) s.add(ex.exercise.primaryMuscle);
  }
  return Array.from(s);
}

function favoritesCol(uid: string) {
  return collection(db, 'users', uid, 'favoriteWorkouts');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a unique fingerprint for a GeneratedWorkout so we can detect duplicates.
 * Uses title + difficulty + exercise IDs sorted — stable across re-renders.
 */
export function workoutFingerprint(workout: GeneratedWorkout): string {
  const ids = workout.exercises.map((e) => e.exercise.id).sort().join(',');
  return `${workout.title}|${workout.difficulty}|${ids}`;
}

export async function addFavorite(
  workout: GeneratedWorkout,
  workoutLocation?: string,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be logged in to favorite a workout');

  const payload: FavoriteWorkoutWrite = {
    title: workout.title || '',
    description: workout.description || '',
    difficulty: workout.difficulty,
    estimatedDuration: workout.estimatedDuration ?? 0,
    exerciseCount: workout.exercises.length,
    totalPlannedSets: workout.totalPlannedSets ?? 0,
    isRecovery: workout.isRecovery ?? false,
    structure: workout.structure || '',
    exercises: serializeExercises(workout),
    equipment: extractEquipment(workout),
    muscles: extractMuscles(workout),
    workoutLocation: workoutLocation ?? null,
    isDownloaded: false,
  };

  const sanitized = sanitizeForFirestore(payload);

  // ── Diagnostic log — remove once confirmed working ──
  console.log('[addFavorite] Sanitized payload:', JSON.stringify(sanitized, null, 2));

  const ref = await addDoc(favoritesCol(user.uid), {
    ...sanitized,
    savedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function removeFavorite(favoriteId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, 'users', user.uid, 'favoriteWorkouts', favoriteId));
}

export async function getFavorites(uid: string): Promise<FavoriteWorkout[]> {
  const q = query(favoritesCol(uid), orderBy('savedAt', 'desc'));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      savedAt: data.savedAt?.toDate?.() ?? new Date(),
    } as FavoriteWorkout;
  });
}

/**
 * Check if a workout with matching fingerprint is already favorited.
 * Uses a simple title + difficulty query to stay within Firestore limits.
 */
export async function findExistingFavorite(
  uid: string,
  title: string,
  difficulty: number,
): Promise<FavoriteWorkout | null> {
  const q = query(
    favoritesCol(uid),
    where('title', '==', title),
    where('difficulty', '==', difficulty),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return { id: d.id, ...data, savedAt: data.savedAt?.toDate?.() ?? new Date() } as FavoriteWorkout;
}
