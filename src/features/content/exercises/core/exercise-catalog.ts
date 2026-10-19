/**
 * Exercise catalog — the ONE cached accessor for the full `exercises` collection on the
 * user-facing side (perf, 19.10.2026).
 *
 * Why: ~300 heavy docs were re-read from Firestore by ~18 non-admin call sites (workout
 * generation, preview/active/overview pages, swaps, library, skill tree, progression…),
 * every time — getDocs defaults to the server, so the SDK's persistent cache didn't help.
 * Now: memory → IndexedDB → one Firestore read per EXERCISE_CATALOG_TTL_MS per device, with
 * concurrent callers sharing one in-flight read.
 *
 * Contract:
 *   - Same data/order as getAllExercises() (Firestore orderBy name); if that query fails it
 *     falls back to the unordered read rather than failing the screen.
 *   - Each call returns fresh (deep-cloned) objects, exactly like an uncached read.
 *   - Can be up to EXERCISE_CATALOG_TTL_MS stale. Admin pages keep calling getAllExercises()
 *     (live); every admin save path in exercise.service.ts calls invalidateExerciseCatalog()
 *     so the admin's own app views show the edit immediately.
 */
import type { Exercise } from './exercise.types';
import { readAllExercisesOrdered, readAllExercisesUnordered } from './exercise-collection.reads';
import { createPersistentTtlCache, type PersistentTtlCache } from '@/lib/persistentTtlCache';
import { createIdbRecordStore } from '@/lib/idbRecordStore';

export const EXERCISE_CATALOG_TTL_MS = 30 * 60 * 1000;
/** Bump the version suffix whenever normalizeExercise's output shape changes. */
export const EXERCISE_CATALOG_STORE_KEY = 'exercises:v1';

export async function fetchExerciseCatalogFromFirestore(): Promise<Exercise[]> {
  try {
    return await readAllExercisesOrdered();
  } catch (error) {
    console.warn('[ExerciseCatalog] ordered read failed, falling back to unordered:', error);
    return readAllExercisesUnordered();
  }
}

let catalog: PersistentTtlCache<Exercise[]> | null = null;
function getCatalog(): PersistentTtlCache<Exercise[]> {
  if (!catalog) {
    catalog = createPersistentTtlCache<Exercise[]>({
      fetcher: fetchExerciseCatalogFromFirestore,
      ttlMs: EXERCISE_CATALOG_TTL_MS,
      store: createIdbRecordStore<Exercise[]>(EXERCISE_CATALOG_STORE_KEY),
    });
  }
  return catalog;
}

/** All exercises (cached). Treat as the default for any non-admin read of the catalog. */
export function getExerciseCatalog(): Promise<Exercise[]> {
  return getCatalog().get();
}

/** Drop the cached catalog (memory + IndexedDB) — call after any write to `exercises`. */
export function invalidateExerciseCatalog(): void {
  getCatalog().invalidate();
}
