/**
 * Workout Share Service
 *
 * Persists a GeneratedWorkout to the `sharedWorkouts` Firestore collection
 * and triggers native sharing (Web Share API → WhatsApp → clipboard fallback).
 */
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { GeneratedWorkout } from '../logic/WorkoutGenerator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedWorkoutDoc {
  title: string;
  description: string;
  difficulty: number;
  estimatedDuration: number;
  exerciseCount: number;
  totalPlannedSets: number;
  isRecovery: boolean;
  structure: string;
  /** Serialised exercise list (stripped of scoring internals) */
  exercises: SharedExercise[];
  /** Equipment canonical IDs used across the workout */
  equipment: string[];
  /** Primary muscles targeted */
  muscles: string[];
  /** Location context the workout was generated for */
  workoutLocation?: string;
  creatorId: string;
  createdAt: ReturnType<typeof serverTimestamp>;
}

export interface SharedExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  repsRange?: { min: number; max: number };
  isTimeBased: boolean;
  restSeconds: number;
  imageUrl?: string;
  videoUrl?: string;
  primaryMuscle?: string;
  exerciseRole?: 'warmup' | 'main' | 'cooldown';
  pairedWith?: string;

  // ── Enrichment: text-based fields for offline exercise details ──
  secondaryMuscles?: string[];
  symmetry?: string;
  movementGroup?: string;
  instructions?: string;
  description?: string;
  specificCues?: string[];
  goal?: string;
  notes?: string[];
  highlights?: string[];
  methodCues?: string[];
  methodHighlights?: string[];
  notificationText?: string;
}

export interface ShareWorkoutResult {
  success: boolean;
  sharedId?: string;
  url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => (value === undefined ? null : value)),
  );
}

const SHARE_BASE_URL = 'https://out-run-app.vercel.app';

function buildShareUrl(docId: string): string {
  return `${SHARE_BASE_URL}/workouts/${docId}`;
}

function extractEquipment(workout: GeneratedWorkout): string[] {
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    const ids = [
      ...(ex.method?.gearIds ?? []),
      ...(ex.method?.equipmentIds ?? []),
    ];
    for (const id of ids) {
      if (id) seen.add(id);
    }
  }
  return Array.from(seen);
}

function extractMuscles(workout: GeneratedWorkout): string[] {
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exercise.primaryMuscle) seen.add(ex.exercise.primaryMuscle);
  }
  return Array.from(seen);
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

function resolveImageUrl(ex: GeneratedWorkout['exercises'][number]): string | null {
  const method = ex.method;
  return (
    method?.media?.imageUrl ??
    ex.exercise.media?.imageUrl ??
    null
  );
}

function resolveVideoUrl(ex: GeneratedWorkout['exercises'][number]): string | null {
  const method = ex.method;
  return (
    method?.media?.mainVideoUrl ??
    method?.media?.videoUrl ??
    ex.exercise.media?.videoUrl ??
    ex.exercise.media?.mainVideoUrl ??
    null
  );
}

function buildSharedExercises(workout: GeneratedWorkout): SharedExercise[] {
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

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Persist a generated workout to Firestore and return the shareable URL.
 */
export async function persistSharedWorkout(
  workout: GeneratedWorkout,
  workoutLocation?: string,
): Promise<{ docId: string; url: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be logged in to share a workout');

  const raw: Omit<SharedWorkoutDoc, 'createdAt'> = {
    title: workout.title || '',
    description: workout.description || '',
    difficulty: workout.difficulty,
    estimatedDuration: workout.estimatedDuration ?? 0,
    exerciseCount: workout.exercises.length,
    totalPlannedSets: workout.totalPlannedSets ?? 0,
    isRecovery: workout.isRecovery ?? false,
    structure: workout.structure || '',
    exercises: buildSharedExercises(workout),
    equipment: extractEquipment(workout),
    muscles: extractMuscles(workout),
    workoutLocation: workoutLocation ?? null,
    creatorId: user.uid,
  };

  const docRef = await addDoc(collection(db, 'sharedWorkouts'), {
    ...sanitizeForFirestore(raw),
    createdAt: serverTimestamp(),
  });
  return { docId: docRef.id, url: buildShareUrl(docRef.id) };
}

/**
 * Fetch a shared workout by its Firestore document ID.
 * Returns null when the document does not exist.
 */
export async function getSharedWorkout(docId: string): Promise<(SharedWorkoutDoc & { id: string }) | null> {
  try {
    const snap = await getDoc(doc(db, 'sharedWorkouts', docId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as SharedWorkoutDoc) };
  } catch (err) {
    console.error('[ShareService] Error fetching shared workout:', err);
    return null;
  }
}

/**
 * Persist + trigger the platform share sheet (or fallback).
 */
export async function shareWorkout(
  workout: GeneratedWorkout,
  workoutLocation?: string,
): Promise<ShareWorkoutResult> {
  try {
    const { docId, url } = await persistSharedWorkout(workout, workoutLocation);

    const diffLabel = DIFFICULTY_LABELS[workout.difficulty] || '';
    const shareText = `💪 ${workout.title} — ${diffLabel} | ${workout.estimatedDuration} דק׳ | ${workout.exercises.length} תרגילים\nבוא/י לנסות את האימון שלי ב-Out!`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: workout.title, text: shareText, url });
        return { success: true, sharedId: docId, url };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return { success: false, sharedId: docId, url, error: 'cancelled' };
        }
        // Fall through to WhatsApp
      }
    }

    // Fallback: WhatsApp deep link
    const waText = `${shareText}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank');
    return { success: true, sharedId: docId, url };
  } catch (err) {
    console.error('[ShareService] shareWorkout failed:', err);

    // Last-resort: copy URL to clipboard if we have one
    try {
      const text = `${workout.title}\nhttps://out-run-app.vercel.app/workouts/share-error`;
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
