'use client';

import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useNetworkAwareStreamUrl } from '@/features/content/exercises/client/hooks/useNetworkAwareStreamUrl';

/**
 * usePlayerMedia — offline-aware, network-quality-adaptive media URL resolver
 * for the live workout player.
 *
 * Resolution order for Bunny videos (bunnyVideoId is provided):
 *   1. IndexedDB blob (720p cache hit) → immediate offline playback.
 *   2. Live Bunny MP4 at network-appropriate resolution (1080p / 720p / 360p).
 *
 * Resolution order for legacy / non-Bunny videos (no bunnyVideoId):
 *   1. IndexedDB blob (cached at original URL).
 *   2. Original network URL (only when online).
 *
 * Images always fall back to a placeholder when offline and uncached.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-1).
 */

const OFFLINE_PLACEHOLDER = '/images/park-placeholder.svg';

export interface PlayerMediaInput {
  /** Raw video URL of the currently active exercise (from state machine). */
  exerciseVideoUrl: string | null | undefined;
  /** Bare Bunny UUID for the active exercise — enables network-aware resolution. */
  bunnyVideoId?: string | null;
  /** Raw image URL of the currently active exercise. */
  exerciseImageUrl: string | null | undefined;
  /** Raw video URL of the next exercise (for preload). */
  nextExerciseVideoUrl: string | null | undefined;
  /** Bare Bunny UUID for the next exercise — enables network-aware preload. */
  nextBunnyVideoId?: string | null;
}

export interface PlayerMediaResult {
  safeVideoUrl: string | null;
  safeImageUrl: string | null;
  safeNextVideoUrl: string | null;
}

export function usePlayerMedia({
  exerciseVideoUrl,
  bunnyVideoId,
  exerciseImageUrl,
  nextExerciseVideoUrl,
  nextBunnyVideoId,
}: PlayerMediaInput): PlayerMediaResult {
  const isOnline = useOnlineStatus();

  // Network-aware Bunny URLs (cache-first → dynamic resolution).
  // The hook returns null while it resolves; the player renders the poster
  // meanwhile and then transitions to the stream URL automatically.
  const { streamUrl: bunnyStreamUrl } = useNetworkAwareStreamUrl(bunnyVideoId ?? null);
  const { streamUrl: nextBunnyStreamUrl } = useNetworkAwareStreamUrl(nextBunnyVideoId ?? null);

  // Legacy path — blob lookup keyed by the original Firestore URL.
  const cachedVideoUrl = useCachedMediaUrl(exerciseVideoUrl ?? null);
  const cachedImageUrl = useCachedMediaUrl(exerciseImageUrl ?? null);
  const cachedNextVideoUrl = useCachedMediaUrl(nextExerciseVideoUrl ?? null);

  // Active exercise video
  const safeVideoUrl = (() => {
    if (bunnyVideoId) {
      // Bunny path: hook resolves to blob (cached) or live network URL.
      return bunnyStreamUrl;
    }
    // Legacy path: blob always works; network URL only when online.
    return cachedVideoUrl?.startsWith('blob:')
      ? cachedVideoUrl
      : isOnline
        ? cachedVideoUrl
        : null;
  })();

  // Image (not network-quality-dependent)
  const safeImageUrl = cachedImageUrl?.startsWith('blob:')
    ? cachedImageUrl
    : isOnline
      ? cachedImageUrl
      : OFFLINE_PLACEHOLDER;

  // Next-exercise preload video
  const safeNextVideoUrl = (() => {
    if (nextBunnyVideoId) {
      return nextBunnyStreamUrl;
    }
    return cachedNextVideoUrl?.startsWith('blob:')
      ? cachedNextVideoUrl
      : isOnline
        ? cachedNextVideoUrl
        : null;
  })();

  return { safeVideoUrl, safeImageUrl, safeNextVideoUrl };
}

export { OFFLINE_PLACEHOLDER };
