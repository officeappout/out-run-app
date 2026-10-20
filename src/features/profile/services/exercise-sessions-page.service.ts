/**
 * Exercise page v2 (enable_home_v2) — paged session reads.
 *
 * Replaces the unbounded getExerciseAnalytics read for the v2 page: newest
 * first, `pageSize` per call (60 → covers "חודש / 3 חודשים / הכל (60
 * האחרונים)"), and "טען עוד" continues with startAfter(cursor).
 * Path: users/{uid}/exerciseHistory/{exerciseId}/sessions (single-field
 * orderBy on `date` — no composite index). Read-only.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ExerciseSessionEntry, RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';

export const EXERCISE_PAGE_SIZE = 60;

export interface ExerciseSessionsPage {
  /** Newest → oldest. */
  sessions: RichExerciseSession[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export async function getExerciseSessionsPage(
  userId: string,
  exerciseId: string,
  cursor: QueryDocumentSnapshot | null = null,
  pageSize = EXERCISE_PAGE_SIZE,
): Promise<ExerciseSessionsPage> {
  if (!userId || !exerciseId) return { sessions: [], cursor: null, hasMore: false };
  const ref = collection(db, 'users', userId, 'exerciseHistory', exerciseId, 'sessions');
  const q = cursor
    ? query(ref, orderBy('date', 'desc'), startAfter(cursor), limit(pageSize))
    : query(ref, orderBy('date', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  const sessions = snap.docs.map((d) => {
    const raw = d.data() as ExerciseSessionEntry;
    const ts = raw.date as { toMillis?: () => number; seconds?: number } | null;
    const dateMs = ts?.toMillis?.() ?? (ts?.seconds != null ? ts.seconds * 1000 : Date.now());
    return { ...raw, reps: Array.isArray(raw.reps) ? raw.reps : [], dateMs };
  });
  return {
    sessions,
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : cursor,
    hasMore: snap.docs.length === pageSize,
  };
}
