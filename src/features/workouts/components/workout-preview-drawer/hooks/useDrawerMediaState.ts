'use client';

import { useMemo } from 'react';
import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { pickHeroExercise, resolveHeroMedia } from '@/features/workout-engine/shared/utils/heroMedia.utils';

interface HeroMedia {
  thumbnailUrl?: string;
  videoUrl?: string;
}

interface UseDrawerMediaStateReturn {
  /** Hero media computed from the drawer's OWN workout (thumbnail + looping video). */
  heroMedia: HeroMedia | null;
  /** Offline-cached blob URL for the hero thumbnail (or the original URL when online). */
  cachedHeroThumb: string | null;
  /** Offline-cached blob URL for the hero video, or `null` when none is set. */
  cachedHeroVideo: string | null;
}

/**
 * Derives the drawer's hero media DIRECTLY from the live workout it is showing —
 * `pickHeroExercise` picks a main-part exercise (see the shared util's fallback
 * hierarchy) and `resolveHeroMedia` resolves its thumbnail + video for the
 * current location. Recomputes whenever the exercises or location change, so a
 * swap / swap-all / option-switch while the drawer is open updates the hero
 * instead of leaving a stale one.
 *
 * (Previously this read a single global `sessionStorage('workout_hero_media')`
 * slot written by the home dashboard, which went stale on in-drawer edits and
 * could show an exercise not in the drawer's actual list.)
 *
 * When there are no generated exercises (a curated workout opened with only a
 * `coverImage`) the thumbnail falls back to `workoutCoverImage`.
 */
export function useDrawerMediaState(
  exercises: WorkoutExercise[] | undefined,
  location: string | null | undefined,
  workoutCoverImage: string | undefined,
): UseDrawerMediaStateReturn {
  const heroMedia = useMemo<HeroMedia | null>(() => {
    if (!exercises?.length) return null;
    const heroEx = pickHeroExercise(exercises, location);
    return resolveHeroMedia(heroEx, location);
  }, [exercises, location]);

  const cachedHeroThumb = useCachedMediaUrl(
    heroMedia?.thumbnailUrl || workoutCoverImage || null,
  );
  const cachedHeroVideo = useCachedMediaUrl(heroMedia?.videoUrl || null);

  return { heroMedia, cachedHeroThumb, cachedHeroVideo };
}
