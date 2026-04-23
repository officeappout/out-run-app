/**
 * Background Media Downloader
 *
 * When a workout is favorited, this module fetches all exercise
 * imageUrl / videoUrl assets as blobs and stores them in IndexedDB.
 * Once every media item for a workout is cached it marks
 * the workout as `isDownloaded: true` in both Firestore and the store.
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { FavoriteWorkout } from '../types';
import {
  saveMediaBlob,
  getMediaBlob,
  getMediaBudgetUsed,
  saveWorkoutLocally,
  getLocalWorkout,
} from './favorites-db';

/** Max concurrent fetches to avoid saturating the connection */
const MAX_CONCURRENCY = 3;
const MEDIA_BUDGET_BYTES = 150 * 1024 * 1024;

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/**
 * Returns true for URLs we can actually download (Firebase Storage, CDN assets).
 * Skips YouTube, data: URIs, and empty values.
 */
function isDownloadableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return false;
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return false;
  return true;
}

/**
 * Collect every unique media URL attached to a workout's exercises
 * — both imageUrl AND videoUrl, plus any workout-level poster.
 */
function collectMediaUrls(workout: FavoriteWorkout): { url: string; exerciseId: string }[] {
  const seen = new Set<string>();
  const result: { url: string; exerciseId: string }[] = [];

  const add = (url: string | undefined | null, exerciseId: string) => {
    if (url && !seen.has(url) && isDownloadableUrl(url)) {
      seen.add(url);
      result.push({ url, exerciseId });
    }
  };

  for (const ex of workout.exercises) {
    add(ex.imageUrl, ex.exerciseId);
    add((ex as any).videoUrl, ex.exerciseId);
  }

  console.log(`[MediaDownloader] collectMediaUrls for "${workout.title}": ${result.length} URLs found`);
  return result;
}

// ---------------------------------------------------------------------------
// Fetch with concurrency limiter
// ---------------------------------------------------------------------------

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    return await res.blob();
  } catch (err) {
    console.warn('[MediaDownloader] fetch failed for', url, err);
    return null;
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().then((r) => { results.push(r); });
    const wrapped = p.then(() => { executing.delete(wrapped); });
    executing.add(wrapped);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ---------------------------------------------------------------------------
// Core download logic
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  workoutId: string;
  total: number;
  completed: number;
  failed: number;
  done: boolean;
}

/**
 * Download all media for a single favorited workout.
 * Skips URLs that are already cached.
 * Returns progress info.
 */
export async function downloadWorkoutMedia(
  workout: FavoriteWorkout,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  console.log(`[MediaDownloader] Starting download for workout "${workout.title}" (id=${workout.id})`);

  const urls = collectMediaUrls(workout);
  const progress: DownloadProgress = {
    workoutId: workout.id,
    total: urls.length,
    completed: 0,
    failed: 0,
    done: false,
  };

  if (urls.length === 0) {
    console.log('[MediaDownloader] No media URLs — marking as downloaded immediately');
    progress.done = true;
    onProgress?.(progress);
    return progress;
  }

  // Check budget before starting
  const budgetUsed = await getMediaBudgetUsed();
  if (budgetUsed >= MEDIA_BUDGET_BYTES) {
    console.warn('[MediaDownloader] Storage budget exhausted, skipping workout', workout.id);
    progress.done = true;
    onProgress?.(progress);
    return progress;
  }

  const tasks = urls.map(({ url, exerciseId }) => async () => {
    // Skip if already cached
    const existing = await getMediaBlob(url);
    if (existing) {
      progress.completed++;
      onProgress?.(progress);
      return;
    }

    const blob = await fetchBlob(url);
    if (!blob) {
      progress.failed++;
      onProgress?.(progress);
      return;
    }

    const saved = await saveMediaBlob(url, blob, exerciseId, workout.id);
    if (saved) {
      progress.completed++;
    } else {
      progress.failed++;
    }
    onProgress?.(progress);
  });

  await runWithConcurrency(tasks, MAX_CONCURRENCY);

  progress.done = true;
  onProgress?.(progress);

  // If all media succeeded (or were already cached), mark as downloaded
  const allCached = progress.completed === progress.total;
  console.log(`[MediaDownloader] Done: ${progress.completed}/${progress.total} cached, ${progress.failed} failed, allCached=${allCached}`);
  if (allCached) {
    await markWorkoutDownloaded(workout.id);
  }

  return progress;
}

// ---------------------------------------------------------------------------
// Firestore + IDB status update
// ---------------------------------------------------------------------------

async function markWorkoutDownloaded(workoutId: string): Promise<void> {
  console.log(`[MediaDownloader] Marking workout ${workoutId} as downloaded`);
  try {
    const uid = auth.currentUser?.uid;
    if (uid && (typeof navigator === 'undefined' || navigator.onLine)) {
      const ref = doc(db, 'users', uid, 'favoriteWorkouts', workoutId);
      await updateDoc(ref, { isDownloaded: true });
    }

    const local = await getLocalWorkout(workoutId);
    if (local) {
      await saveWorkoutLocally({ ...local, isDownloaded: true });
    }
    console.log(`[MediaDownloader] ✅ Workout ${workoutId} marked as downloaded`);
  } catch (err) {
    console.error('[MediaDownloader] markWorkoutDownloaded failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Store subscriber — auto-download on favorite
// ---------------------------------------------------------------------------

let unsubscribe: (() => void) | null = null;

/**
 * Start observing the favorites store.
 * When a new workout is added (and not yet downloaded), kick off the
 * background media download.
 */
export function startMediaDownloadObserver(
  store: {
    getState: () => { favorites: Map<string, FavoriteWorkout>; downloadedIds: Set<string> };
    subscribe: (listener: () => void) => () => void;
  },
  onDownloaded?: (workoutId: string) => void,
): void {
  if (unsubscribe) return;

  let previousIds = new Set(store.getState().favorites.keys());

  unsubscribe = store.subscribe(() => {
    const { favorites, downloadedIds } = store.getState();
    const currentIds = new Set(favorites.keys());

    // Find newly added favorites
    for (const id of currentIds) {
      if (!previousIds.has(id) && !downloadedIds.has(id)) {
        const workout = favorites.get(id);
        if (workout) {
          downloadWorkoutMedia(workout).then((p) => {
            if (p.completed === p.total) {
              onDownloaded?.(id);
            }
          }).catch((err) => {
            console.error('[MediaDownloader] Auto-download failed for', id, err);
          });
        }
      }
    }

    previousIds = currentIds;
  });
}

export function stopMediaDownloadObserver(): void {
  unsubscribe?.();
  unsubscribe = null;
}
