'use client';

import { useEffect, useState } from 'react';
import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';

interface HeroMedia {
  thumbnailUrl?: string;
  videoUrl?: string;
}

interface UseDrawerMediaStateReturn {
  /** Raw payload read from `sessionStorage('workout_hero_media')`, if any. */
  heroMedia: HeroMedia | null;
  /** Offline-cached blob URL for the hero thumbnail (or the original URL when online). */
  cachedHeroThumb: string | null;
  /** Offline-cached blob URL for the hero video, or `null` when none is set. */
  cachedHeroVideo: string | null;
}

/**
 * Hydrates the drawer's hero media from `sessionStorage` once on mount
 * and resolves the offline-cache URLs for the thumbnail + looping video.
 *
 * The session key `workout_hero_media` is written by `home/page.tsx` at
 * generation time and contains `{ thumbnailUrl?, videoUrl? }`.  When
 * neither is present, the drawer falls back to `workout.coverImage`.
 */
export function useDrawerMediaState(
  workoutCoverImage: string | undefined,
): UseDrawerMediaStateReturn {
  const [heroMedia, setHeroMedia] = useState<HeroMedia | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('workout_hero_media');
      if (raw) setHeroMedia(JSON.parse(raw));
    } catch {
      /* corrupt payload — silently ignore and let the drawer fall back to coverImage */
    }
  }, []);

  const cachedHeroThumb = useCachedMediaUrl(
    heroMedia?.thumbnailUrl || workoutCoverImage || null,
  );
  const cachedHeroVideo = useCachedMediaUrl(heroMedia?.videoUrl || null);

  return { heroMedia, cachedHeroThumb, cachedHeroVideo };
}
