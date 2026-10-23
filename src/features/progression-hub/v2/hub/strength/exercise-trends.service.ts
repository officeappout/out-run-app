/**
 * Strength page — the most recently trained exercises with their trend. ONE
 * bounded read of the top-level users/{uid}/exerciseHistory docs (orderBy
 * updatedAt, limit n): each already carries the best set of its last 7
 * sessions (recentMax) and the all-time best (bestReps / bestAt), written by
 * exercise-history.service since enable_home_v2. No sessions sub-reads (no N+1).
 */
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { readDate } from '../../utils/progress-model';

export interface ExerciseTrend {
  exerciseId: string;
  name: string;
  /** Best set of each of the last ≤ 7 sessions, oldest → newest (may be empty on older docs). */
  recentMax: number[];
  /** Best set of the most recent session (from reps when recentMax is missing). */
  lastBest: number;
  bestReps: number;
  bestAt: Date | null;
  updatedAt: Date | null;
}

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : []);

export function toExerciseTrend(id: string, data: Record<string, unknown>): ExerciseTrend {
  const reps = nums(data.reps);
  const recentMax = nums(data.recentMax);
  const lastBest = recentMax.length ? recentMax[recentMax.length - 1] : reps.length ? Math.max(...reps) : 0;
  return {
    exerciseId: id,
    name: typeof data.exerciseName === 'string' && data.exerciseName ? data.exerciseName : id,
    recentMax,
    lastBest,
    bestReps: typeof data.bestReps === 'number' ? data.bestReps : 0,
    bestAt: readDate(data.bestAt),
    updatedAt: readDate(data.updatedAt),
  };
}

export async function getExerciseTrends(uid: string, n = 8): Promise<ExerciseTrend[]> {
  if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) return [];
  const q = query(collection(db, 'users', uid, 'exerciseHistory'), orderBy('updatedAt', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toExerciseTrend(d.id, d.data()));
}
