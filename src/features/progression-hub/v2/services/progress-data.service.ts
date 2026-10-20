/**
 * Progress tab v2 — bounded, one-shot reads (no listeners).
 *
 * Every query has a hard limit() and uses an index that already exists:
 *   workouts      {userId, date}               (getWorkoutsInDateRange)
 *   workouts      {userId, workoutType, date}  (getRunTrend)
 *   dailyActivity {userId, date desc}          (getStepsTrend)
 *   users/{uid}/exerciseHistory orderBy updatedAt (getRecentExerciseIds)
 * Docs are reduced to light shapes immediately (routePath never kept).
 * Read-only: nothing here writes.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import {
  readDate,
  toProgressDay,
  toProgressWorkout,
  type ProgressDay,
  type ProgressWorkout,
} from '../utils/progress-model';

function offline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** Workouts with start ≤ date < end, newest first, at most `max`. Returned oldest → newest. */
export async function getWorkoutsWindow(uid: string, start: Date, end: Date, max = 80): Promise<ProgressWorkout[]> {
  if (!uid || offline()) return [];
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', uid),
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
    orderBy('date', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toProgressWorkout(d.id, d.data()))
    .filter((w): w is ProgressWorkout => w !== null)
    .reverse();
}

/** The last `n` workouts of one workoutType, oldest → newest. */
export async function getRecentWorkoutsOfType(
  uid: string,
  workoutType: 'running' | 'walking' | 'strength',
  n = 40,
): Promise<ProgressWorkout[]> {
  if (!uid || offline()) return [];
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', uid),
    where('workoutType', '==', workoutType),
    orderBy('date', 'desc'),
    limit(n),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toProgressWorkout(d.id, d.data()))
    .filter((w): w is ProgressWorkout => w !== null)
    .reverse();
}

/** dailyActivity docs with startISO ≤ date ≤ endISO (≤ 62), oldest → newest. */
export async function getDailyActivityRange(uid: string, startISO: string, endISO: string, max = 62): Promise<ProgressDay[]> {
  if (!uid || offline()) return [];
  const q = query(
    collection(db, 'dailyActivity'),
    where('userId', '==', uid),
    where('date', '>=', startISO),
    where('date', '<=', endISO),
    orderBy('date', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toProgressDay(d.data(), DAILY_STEP_GOAL))
    .filter((x): x is ProgressDay => x !== null)
    .reverse();
}

/** The last `n` dailyActivity docs, oldest → newest (P-2d: 30, never the 365 of /activity/steps). */
export async function getRecentDays(uid: string, n = 30): Promise<ProgressDay[]> {
  if (!uid || offline()) return [];
  const q = query(collection(db, 'dailyActivity'), where('userId', '==', uid), orderBy('date', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toProgressDay(d.data(), DAILY_STEP_GOAL))
    .filter((x): x is ProgressDay => x !== null)
    .reverse();
}

export interface ExerciseSnapshot {
  exerciseId: string;
  name: string;
  /** Best set of the most recent session. */
  lastBest: number;
  updatedAt: Date | null;
}

/** "התרגילים שלך" (P-2b): the top-level exerciseHistory docs only — no sessions reads (no N+1). */
export async function getRecentExerciseSnapshots(uid: string, n = 5): Promise<ExerciseSnapshot[]> {
  if (!uid || offline()) return [];
  const q = query(collection(db, 'users', uid, 'exerciseHistory'), orderBy('updatedAt', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as { exerciseName?: string; reps?: unknown; updatedAt?: unknown };
    const reps = Array.isArray(data.reps) ? data.reps.filter((r): r is number => typeof r === 'number') : [];
    return {
      exerciseId: d.id,
      name: data.exerciseName || d.id,
      lastBest: reps.length ? Math.max(...reps) : 0,
      updatedAt: readDate(data.updatedAt),
    };
  });
}
