'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { shareWorkout } from '@/features/workout-engine/services/share.service';
import type { WorkoutData } from '../types';

interface UseFavoritesActionsParams {
  generatedWorkout: GeneratedWorkout | null | undefined;
  workout: WorkoutData | null;
  workoutLocation: string | undefined;
}

interface UseFavoritesActionsReturn {
  /** Drawer-wide favorite flag for the current workout. */
  isFav: boolean;
  /** True while the favorite toggle is in flight (debounce + UI spinner). */
  isFavToggling: boolean;
  /** Resolved favorite document id, or `undefined` until it lands. */
  favId: string | undefined;
  /** True once the favorite's offline media bundle has finished downloading. */
  isFavDownloaded: boolean;
  /** True while the download pipeline is actively pulling assets. */
  isFavDownloading: boolean;
  /** 0–1 progress for the download ring. */
  dlProgress: number;
  /** True while a share request is in flight (suppresses repeat taps). */
  isSharing: boolean;
  /** Toggle the workout's favorite state — no-op when no `generatedWorkout`. */
  handleToggleFavorite: () => Promise<void>;
  /** Favorite (if needed) and trigger an offline media download. */
  handleDownload: () => Promise<void>;
  /** Share the workout via the native share sheet or a WhatsApp fallback. */
  handleShare: () => Promise<void>;
}

/**
 * Consolidates the drawer's three "action bar" verbs — favorite, share,
 * and download — alongside the six derived selectors the UI binds to.
 *
 * All three handlers are wrapped in `useCallback` with explicit dependency
 * arrays so the memoised `<ExerciseCard />` and `<DrawerFooter />` children
 * never see a fresh reference between renders unless a real dependency
 * actually changed.
 */
export function useFavoritesActions({
  generatedWorkout,
  workout,
  workoutLocation,
}: UseFavoritesActionsParams): UseFavoritesActionsReturn {
  const {
    toggleFavorite,
    triggerDownload,
    isFavorited: checkIsFavorited,
    isToggling: checkIsToggling,
    getFavoriteId: checkGetFavoriteId,
    isDownloaded: checkIsDownloaded,
    isDownloading: checkIsDownloading,
    getDownloadProgress: checkDownloadProgress,
    loadFavorites,
    _hydrated: favsHydrated,
  } = useFavoritesStore();

  useEffect(() => {
    if (!favsHydrated) loadFavorites();
  }, [favsHydrated, loadFavorites]);

  const isFav = generatedWorkout ? checkIsFavorited(generatedWorkout) : false;
  const isFavToggling = generatedWorkout ? checkIsToggling(generatedWorkout) : false;
  const favId = generatedWorkout ? checkGetFavoriteId(generatedWorkout) : undefined;
  const isFavDownloaded = favId ? checkIsDownloaded(favId) : false;
  const isFavDownloading = favId ? checkIsDownloading(favId) : isFavToggling;
  const dlProgress = favId ? checkDownloadProgress(favId) : 0;

  const [isSharing, setIsSharing] = useState(false);

  const handleToggleFavorite = useCallback(async () => {
    if (isFavToggling) return;
    if (!generatedWorkout) {
      console.warn('[useFavoritesActions] Cannot favorite — no generatedWorkout available');
      return;
    }
    try {
      await toggleFavorite(generatedWorkout, workoutLocation);
    } catch (err) {
      console.error('[useFavoritesActions] toggleFavorite failed:', err);
    }
  }, [generatedWorkout, isFavToggling, toggleFavorite, workoutLocation]);

  const handleDownload = useCallback(async () => {
    if (isFavToggling || isFavDownloading) return;
    if (!generatedWorkout) return;
    if (!isFav) {
      try {
        await toggleFavorite(generatedWorkout, workoutLocation);
      } catch (err) {
        console.error('[useFavoritesActions] download-favorite failed:', err);
      }
    } else if (!isFavDownloaded && favId) {
      try {
        await triggerDownload(favId);
      } catch (err) {
        console.error('[useFavoritesActions] triggerDownload failed:', err);
      }
    }
  }, [
    generatedWorkout,
    isFav,
    isFavDownloaded,
    isFavToggling,
    isFavDownloading,
    favId,
    toggleFavorite,
    triggerDownload,
    workoutLocation,
  ]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;

    if (!generatedWorkout) {
      const title = workout?.title || 'אימון כוח';
      const text = `💪 ${title}\nבוא/י לנסות את האימון שלי ב-Out!\nhttps://out-run-app.vercel.app`;
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title, text });
        } catch {
          /* user cancelled the share sheet */
        }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
      return;
    }

    setIsSharing(true);
    try {
      await shareWorkout(generatedWorkout, workoutLocation);
    } catch (err) {
      console.error('[useFavoritesActions] Share failed:', err);
      const text = `💪 ${generatedWorkout.title}\nבוא/י לנסות את האימון שלי ב-Out!\nhttps://out-run-app.vercel.app`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } finally {
      setIsSharing(false);
    }
  }, [generatedWorkout, workout, workoutLocation, isSharing]);

  return {
    isFav,
    isFavToggling,
    favId,
    isFavDownloaded,
    isFavDownloading,
    dlProgress,
    isSharing,
    handleToggleFavorite,
    handleDownload,
    handleShare,
  };
}
