/**
 * Server-side loader for shared workouts.
 *
 * Reads through the Admin SDK (data-exposure plan phase 0.2, 31.10.2026). It
 * used to call the Firestore REST API with no token, which only worked because
 * `sharedWorkouts` is world-readable; that dependency blocked ever tightening
 * the rule or enforcing App Check on Firestore. Same one-hour cache as the old
 * `fetch(..., { next: { revalidate: 3600 } })`, now via unstable_cache.
 */
import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';

export interface SharedWorkoutMeta {
  title: string;
  description: string;
  difficulty: number;
  estimatedDuration: number;
  exerciseCount: number;
  muscles: string[];
  equipment: string[];
  structure: string;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

async function readSharedWorkoutMeta(docId: string): Promise<SharedWorkoutMeta | null> {
  try {
    const snap = await getAdminDb().collection('sharedWorkouts').doc(docId).get();
    if (!snap.exists) return null;
    const f = snap.data() ?? {};
    return {
      title: str(f.title, ''),
      description: str(f.description, ''),
      difficulty: num(f.difficulty, 2),
      estimatedDuration: num(f.estimatedDuration, 0),
      exerciseCount: num(f.exerciseCount, 0),
      muscles: strArr(f.muscles),
      equipment: strArr(f.equipment),
      structure: str(f.structure, 'standard'),
    };
  } catch (err) {
    console.error('[SharedWorkoutLoader] Admin read failed:', err);
    return null;
  }
}

export async function fetchSharedWorkoutMeta(docId: string): Promise<SharedWorkoutMeta | null> {
  if (!docId || docId.includes('/')) return null;
  return unstable_cache(() => readSharedWorkoutMeta(docId), ['shared-workout-meta', docId], {
    revalidate: 3600,
  })();
}
