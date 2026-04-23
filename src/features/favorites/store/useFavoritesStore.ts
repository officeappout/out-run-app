/**
 * Favorites Zustand Store
 *
 * Manages the favourite-workout state on the client.
 * Hydrates from Firestore on login, mirrors to IndexedDB for offline access.
 */
import { create } from 'zustand';
import { auth } from '@/lib/firebase';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { FavoriteWorkout } from '../types';
import {
  addFavorite,
  removeFavorite,
  getFavorites,
  findExistingFavorite,
} from '../services/favorites.service';
import {
  saveWorkoutLocally,
  removeWorkoutLocally,
  getAllLocalWorkouts,
} from '../services/favorites-db';
import {
  startMediaDownloadObserver,
  stopMediaDownloadObserver,
  downloadWorkoutMedia,
} from '../services/media-downloader';

interface FavoritesState {
  /** Map from Firestore doc ID → FavoriteWorkout */
  favorites: Map<string, FavoriteWorkout>;
  /** Set of downloaded (offline-ready) workout IDs */
  downloadedIds: Set<string>;
  /** Set of workout IDs currently downloading media */
  downloadingIds: Set<string>;
  /** Download progress per workout ID (0–100) */
  downloadProgress: Map<string, number>;
  /** Loading state for initial load */
  isLoading: boolean;
  /** Currently-toggling IDs (prevents double-tap) */
  togglingIds: Set<string>;
  /** Whether the store has been hydrated from Firestore/IDB at least once */
  _hydrated: boolean;

  // ── Actions ──
  loadFavorites: () => Promise<void>;
  toggleFavorite: (workout: GeneratedWorkout, workoutLocation?: string) => Promise<void>;
  triggerDownload: (favId: string) => Promise<void>;
  isFavorited: (workout: GeneratedWorkout) => boolean;
  getFavoriteId: (workout: GeneratedWorkout) => string | undefined;
  isToggling: (workout: GeneratedWorkout) => boolean;
  isDownloading: (id: string) => boolean;
  getDownloadProgress: (id: string) => number;
  markDownloaded: (id: string) => void;
  isDownloaded: (id: string) => boolean;
  reset: () => void;
}

/**
 * Build a lightweight lookup key from a GeneratedWorkout.
 * Must be consistent with the Firestore query in findExistingFavorite.
 */
function lookupKey(w: GeneratedWorkout): string {
  return `${w.title}|${w.difficulty}`;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: new Map(),
  downloadedIds: new Set(),
  downloadingIds: new Set(),
  downloadProgress: new Map(),
  isLoading: false,
  togglingIds: new Set(),
  _hydrated: false,

  // ── Load ──
  loadFavorites: async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      // Offline fallback: load from IndexedDB only
      try {
        const local = await getAllLocalWorkouts();
        const map = new Map(local.map((f) => [f.id, f]));
        const dlIds = new Set(local.filter((f) => f.isDownloaded).map((f) => f.id));
        set({ favorites: map, downloadedIds: dlIds, _hydrated: true });
      } catch { /* empty */ }
      return;
    }

    set({ isLoading: true });
    try {
      const remote = await getFavorites(uid);
      const map = new Map(remote.map((f) => [f.id, f]));
      const dlIds = new Set(remote.filter((f) => f.isDownloaded).map((f) => f.id));

      set({ favorites: map, downloadedIds: dlIds, _hydrated: true, isLoading: false });

      // Mirror to IndexedDB in background
      Promise.all(remote.map((f) => saveWorkoutLocally(f))).catch(() => {});

      // Start auto-download observer for newly-favorited workouts
      startMediaDownloadObserver(useFavoritesStore, (workoutId) => {
        const dl = new Set(useFavoritesStore.getState().downloadedIds);
        dl.add(workoutId);
        useFavoritesStore.setState({ downloadedIds: dl });
      });
    } catch (err) {
      console.error('[FavoritesStore] loadFavorites failed:', err);
      // Fallback to IDB
      try {
        const local = await getAllLocalWorkouts();
        const map = new Map(local.map((f) => [f.id, f]));
        set({ favorites: map, _hydrated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    }
  },

  // ── Toggle ──
  toggleFavorite: async (workout, workoutLocation) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      console.warn('[FavoritesStore] toggleFavorite skipped — user not authenticated');
      return;
    }

    const key = lookupKey(workout);
    const state = get();

    // Prevent double-tap
    if (state.togglingIds.has(key)) return;
    set({ togglingIds: new Set([...state.togglingIds, key]) });

    try {
      // Check if already favorited
      const existingEntry = Array.from(state.favorites.values()).find(
        (f) => f.title === workout.title && f.difficulty === workout.difficulty,
      );

      if (existingEntry) {
        // ── UN-FAVORITE ──
        await removeFavorite(existingEntry.id);
        await removeWorkoutLocally(existingEntry.id);

        const next = new Map(get().favorites);
        next.delete(existingEntry.id);

        const nextDl = new Set(get().downloadedIds);
        nextDl.delete(existingEntry.id);

        set({ favorites: next, downloadedIds: nextDl });
      } else {
        // ── FAVORITE ──
        // Double-check server to avoid duplicates
        const serverMatch = await findExistingFavorite(uid, workout.title, workout.difficulty);
        if (serverMatch) {
          const next = new Map(get().favorites);
          next.set(serverMatch.id, serverMatch);
          set({ favorites: next });
          await saveWorkoutLocally(serverMatch);
          return;
        }

        const newId = await addFavorite(workout, workoutLocation);
        const newFav: FavoriteWorkout = {
          id: newId,
          title: workout.title || '',
          description: workout.description || '',
          difficulty: workout.difficulty,
          estimatedDuration: workout.estimatedDuration ?? 0,
          exerciseCount: workout.exercises.length,
          totalPlannedSets: workout.totalPlannedSets ?? 0,
          isRecovery: workout.isRecovery ?? false,
          structure: workout.structure || '',
          exercises: workout.exercises.map((ex) => {
            const raw = ex.repsRange;
            const exercise = ex.exercise as any;
            const method = ex.method as any;
            const rt = (v: any) => {
              if (!v) return undefined;
              if (typeof v === 'string') return v;
              return v?.he || v?.male || v?.en || undefined;
            };
            const rta = (arr: any[] | undefined | null) => {
              if (!arr || !Array.isArray(arr) || arr.length === 0) return undefined;
              return arr.map((v: any) => rt(v)).filter(Boolean) as string[];
            };
            return {
              exerciseId: exercise.id ?? '',
              name: typeof exercise.name === 'string'
                ? exercise.name
                : exercise.name?.he || exercise.name?.en || exercise.id || '',
              sets: ex.sets ?? 0,
              reps: ex.reps ?? 0,
              repsRange: raw && typeof raw.min === 'number' && typeof raw.max === 'number'
                ? { min: raw.min, max: raw.max } : undefined,
              isTimeBased: ex.isTimeBased ?? false,
              restSeconds: ex.restSeconds ?? 0,
              imageUrl: method?.media?.imageUrl
                ?? exercise.media?.imageUrl ?? undefined,
              videoUrl: method?.media?.mainVideoUrl ?? method?.media?.videoUrl
                ?? exercise.media?.videoUrl ?? exercise.media?.mainVideoUrl ?? undefined,
              primaryMuscle: exercise.primaryMuscle ?? undefined,
              exerciseRole: ex.exerciseRole ?? exercise.exerciseRole ?? 'main',
              pairedWith: ex.pairedWith ?? undefined,
              secondaryMuscles: exercise.secondaryMuscles?.filter(Boolean) ?? undefined,
              symmetry: exercise.symmetry ?? undefined,
              movementGroup: exercise.movementGroup ?? undefined,
              instructions: rt(exercise.content?.instructions),
              description: rt(exercise.content?.description),
              specificCues: rta(exercise.content?.specificCues),
              goal: rt(exercise.content?.goal),
              notes: rta(exercise.content?.notes),
              highlights: rta(exercise.content?.highlights),
              methodCues: rta(method?.specificCues),
              methodHighlights: rta(method?.highlights),
              notificationText: rt(method?.notificationText),
            };
          }),
          equipment: [],
          muscles: [],
          workoutLocation: workoutLocation ?? null,
          isDownloaded: false,
          savedAt: new Date(),
        };

        const next = new Map(get().favorites);
        next.set(newId, newFav);
        set({ favorites: next });

        await saveWorkoutLocally(newFav);

        // Track downloading state and trigger media download
        const dlg = new Set(get().downloadingIds);
        dlg.add(newId);
        const prog = new Map(get().downloadProgress);
        prog.set(newId, 0);
        set({ downloadingIds: dlg, downloadProgress: prog });

        downloadWorkoutMedia(newFav, (p) => {
          const pct = p.total > 0 ? Math.round(((p.completed + p.failed) / p.total) * 100) : 0;
          const m = new Map(get().downloadProgress);
          m.set(newId, pct);
          set({ downloadProgress: m });
        }).then((p) => {
          if (p.completed === p.total) {
            const dl = new Set(get().downloadedIds);
            dl.add(newId);
            set({ downloadedIds: dl });
          }
        }).catch((err) => {
          console.error('[FavoritesStore] media download failed:', err);
        }).finally(() => {
          const next = new Set(get().downloadingIds);
          next.delete(newId);
          const m = new Map(get().downloadProgress);
          m.delete(newId);
          set({ downloadingIds: next, downloadProgress: m });
        });
      }
    } catch (err) {
      console.error('[FavoritesStore] toggleFavorite error:', err);
    } finally {
      const tIds = new Set(get().togglingIds);
      tIds.delete(key);
      set({ togglingIds: tIds });
    }
  },

  // ── Selectors ──
  isFavorited: (workout) => {
    const favs = get().favorites;
    return Array.from(favs.values()).some(
      (f) => f.title === workout.title && f.difficulty === workout.difficulty,
    );
  },

  getFavoriteId: (workout) => {
    const favs = get().favorites;
    const match = Array.from(favs.values()).find(
      (f) => f.title === workout.title && f.difficulty === workout.difficulty,
    );
    return match?.id;
  },

  isToggling: (workout) => {
    return get().togglingIds.has(lookupKey(workout));
  },

  isDownloading: (id) => get().downloadingIds.has(id),

  getDownloadProgress: (id) => get().downloadProgress.get(id) ?? 0,

  triggerDownload: async (favId) => {
    const state = get();
    const fav = state.favorites.get(favId);
    if (!fav || state.downloadingIds.has(favId) || state.downloadedIds.has(favId)) return;

    const dlg = new Set(state.downloadingIds);
    dlg.add(favId);
    const prog = new Map(get().downloadProgress);
    prog.set(favId, 0);
    set({ downloadingIds: dlg, downloadProgress: prog });

    try {
      const result = await downloadWorkoutMedia(fav, (p) => {
        const pct = p.total > 0 ? Math.round(((p.completed + p.failed) / p.total) * 100) : 0;
        const m = new Map(get().downloadProgress);
        m.set(favId, pct);
        set({ downloadProgress: m });
      });
      if (result.completed === result.total) {
        const dl = new Set(get().downloadedIds);
        dl.add(favId);
        set({ downloadedIds: dl });
      }
    } catch (err) {
      console.error('[FavoritesStore] triggerDownload failed:', err);
    } finally {
      const next = new Set(get().downloadingIds);
      next.delete(favId);
      const m = new Map(get().downloadProgress);
      m.delete(favId);
      set({ downloadingIds: next, downloadProgress: m });
    }
  },

  markDownloaded: (id) => {
    const next = new Set(get().downloadedIds);
    next.add(id);
    set({ downloadedIds: next });
  },

  isDownloaded: (id) => get().downloadedIds.has(id),

  reset: () => {
    stopMediaDownloadObserver();
    set({
      favorites: new Map(),
      downloadedIds: new Set(),
      downloadingIds: new Set(),
      downloadProgress: new Map(),
      isLoading: false,
      togglingIds: new Set(),
      _hydrated: false,
    });
  },
}));
