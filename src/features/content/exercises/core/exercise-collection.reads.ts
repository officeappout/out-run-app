/**
 * Raw full-collection reads of `exercises` — the ONLY two places that query the whole
 * collection. Split out of exercise.service.ts so both the live (admin) readers there and the
 * cached catalog (exercise-catalog.ts) share them without an import cycle.
 */
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Exercise } from './exercise.types';
import { normalizeExercise } from '../services/exercise-mapping.utils';

export const EXERCISES_COLLECTION = 'exercises';

/** Every exercise, ordered by `name` (Firestore order — docs without `name` are excluded). */
export async function readAllExercisesOrdered(): Promise<Exercise[]> {
  const snapshot = await getDocs(query(collection(db, EXERCISES_COLLECTION), orderBy('name', 'asc')));
  return snapshot.docs.map((d) => normalizeExercise(d.id, d.data()));
}

/** Every exercise, no orderBy (see getAllExercisesNoOrder for why this variant exists). */
export async function readAllExercisesUnordered(): Promise<Exercise[]> {
  const snapshot = await getDocs(collection(db, EXERCISES_COLLECTION));
  return snapshot.docs.map((d) => normalizeExercise(d.id, d.data()));
}
