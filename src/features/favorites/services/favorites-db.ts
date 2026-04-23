/**
 * IndexedDB layer for offline favorites storage.
 *
 * Uses the `idb` wrapper for a Promise-based API over IndexedDB.
 * DB name: 'out-favorites'
 * Stores:
 *   - workouts:  keyed by Firestore doc ID, holds FavoriteWorkout JSON
 *   - media:     keyed by media URL, holds { blob, exerciseId, workoutId }
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { FavoriteWorkout } from '../types';

const DB_NAME = 'out-favorites';
const DB_VERSION = 1;
const WORKOUTS_STORE = 'workouts';
const MEDIA_STORE = 'media';

/** Storage budget for media blobs — 150 MB */
const MEDIA_BUDGET_BYTES = 150 * 1024 * 1024;

interface MediaEntry {
  url: string;
  blob: Blob;
  exerciseId: string;
  workoutId: string;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WORKOUTS_STORE)) {
          db.createObjectStore(WORKOUTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'url' });
          store.createIndex('byWorkout', 'workoutId');
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Workouts CRUD
// ---------------------------------------------------------------------------

export async function saveWorkoutLocally(workout: FavoriteWorkout): Promise<void> {
  const db = await getDB();
  await db.put(WORKOUTS_STORE, {
    ...workout,
    savedAt: workout.savedAt.getTime(),
  });
}

export async function removeWorkoutLocally(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([WORKOUTS_STORE, MEDIA_STORE], 'readwrite');

  tx.objectStore(WORKOUTS_STORE).delete(id);

  const mediaStore = tx.objectStore(MEDIA_STORE);
  const idx = mediaStore.index('byWorkout');
  let cursor = await idx.openCursor(id);
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function getLocalWorkout(id: string): Promise<FavoriteWorkout | null> {
  const db = await getDB();
  const raw = await db.get(WORKOUTS_STORE, id);
  if (!raw) return null;
  return { ...raw, savedAt: new Date(raw.savedAt) } as FavoriteWorkout;
}

export async function getAllLocalWorkouts(): Promise<FavoriteWorkout[]> {
  const db = await getDB();
  const all = await db.getAll(WORKOUTS_STORE);
  return all
    .map((r) => ({ ...r, savedAt: new Date(r.savedAt) } as FavoriteWorkout))
    .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
}

export async function getLocalWorkoutIds(): Promise<Set<string>> {
  const db = await getDB();
  const keys = await db.getAllKeys(WORKOUTS_STORE);
  return new Set(keys.map(String));
}

// ---------------------------------------------------------------------------
// Media cache (for future background downloader)
// ---------------------------------------------------------------------------

export async function getMediaBudgetUsed(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll(MEDIA_STORE);
  return all.reduce((sum, entry) => sum + (entry.blob?.size ?? 0), 0);
}

export async function saveMediaBlob(
  url: string,
  blob: Blob,
  exerciseId: string,
  workoutId: string,
): Promise<boolean> {
  const used = await getMediaBudgetUsed();
  if (used + blob.size > MEDIA_BUDGET_BYTES) {
    console.warn('[FavDB] Media budget exceeded, skipping', url);
    return false;
  }

  const db = await getDB();
  const entry: MediaEntry = {
    url,
    blob,
    exerciseId,
    workoutId,
    savedAt: Date.now(),
  };
  await db.put(MEDIA_STORE, entry);
  return true;
}

export async function getMediaBlob(url: string): Promise<Blob | null> {
  const db = await getDB();
  const entry = await db.get(MEDIA_STORE, url);
  return entry?.blob ?? null;
}

export async function clearAllMedia(): Promise<void> {
  const db = await getDB();
  await db.clear(MEDIA_STORE);
}
