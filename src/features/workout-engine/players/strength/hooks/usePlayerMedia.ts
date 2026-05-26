'use client';

import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * usePlayerMedia — offline-aware media URL resolver for the live workout player.
 *
 * Wraps three `useCachedMediaUrl` lookups and a single `useOnlineStatus` probe,
 * then gates each result so the player never hits the network while offline:
 *   • blob: URLs (locally cached) always pass through.
 *   • Network URLs pass through only when `isOnline` is true.
 *   • Images fall back to a local placeholder when offline & uncached.
 *   • Videos resolve to `null` when offline & uncached (consumer renders fallback).
 *
 * Pure side-effect-free hook — no state, no refs, no listeners beyond the two
 * underlying hooks.  Extracted from StrengthRunner.tsx (Decoupling Step R-1).
 */

const OFFLINE_PLACEHOLDER = '/images/park-placeholder.svg';

export interface PlayerMediaInput {
  /** Raw video URL of the currently active exercise (from state machine). */
  exerciseVideoUrl: string | null | undefined;
  /** Raw image URL of the currently active exercise. */
  exerciseImageUrl: string | null | undefined;
  /** Raw video URL of the next exercise (for preload). */
  nextExerciseVideoUrl: string | null | undefined;
}

export interface PlayerMediaResult {
  safeVideoUrl: string | null;
  safeImageUrl: string | null;
  safeNextVideoUrl: string | null;
}

export function usePlayerMedia({
  exerciseVideoUrl,
  exerciseImageUrl,
  nextExerciseVideoUrl,
}: PlayerMediaInput): PlayerMediaResult {
  const isOnline = useOnlineStatus();
  const cachedVideoUrl = useCachedMediaUrl(exerciseVideoUrl ?? null);
  const cachedImageUrl = useCachedMediaUrl(exerciseImageUrl ?? null);
  const cachedNextVideoUrl = useCachedMediaUrl(nextExerciseVideoUrl ?? null);

  const safeVideoUrl = cachedVideoUrl?.startsWith('blob:')
    ? cachedVideoUrl
    : isOnline
      ? cachedVideoUrl
      : null;

  const safeImageUrl = cachedImageUrl?.startsWith('blob:')
    ? cachedImageUrl
    : isOnline
      ? cachedImageUrl
      : OFFLINE_PLACEHOLDER;

  const safeNextVideoUrl = cachedNextVideoUrl?.startsWith('blob:')
    ? cachedNextVideoUrl
    : isOnline
      ? cachedNextVideoUrl
      : null;

  return { safeVideoUrl, safeImageUrl, safeNextVideoUrl };
}

export { OFFLINE_PLACEHOLDER };
