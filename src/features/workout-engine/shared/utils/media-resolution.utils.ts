/**
 * Unified Media Resolution Utility
 *
 * Exhaustive 5-level deep search for exercise video/image URLs.
 * Shared across Workout Overview (home/page.tsx), Swap UI, and any
 * component that needs to resolve exercise media.
 *
 * Search priority (video):
 *   1. Selected method's media.mainVideoUrl / media.videoUrl
 *   2. ANY execution method's media.mainVideoUrl / media.videoUrl
 *   3. Exercise-level media.videoUrl
 *   4. Exercise root videoUrl / media.mainVideoUrl
 *
 * Search priority (image):
 *   1. Selected method's media.imageUrl
 *   2. ANY execution method's media.imageUrl
 *   3. Exercise-level media.imageUrl
 *   4. Exercise root imageUrl / coverImage / thumbnailUrl
 *   5. Falls back to resolved video URL (video thumbnail)
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

export interface ResolvedMedia {
  videoUrl: string | undefined;
  imageUrl: string | undefined;
}

/**
 * Resolve media URLs for an exercise, using a deep fallback chain
 * across the selected method, all available methods, and the exercise root.
 *
 * @param exercise  - The exercise object (any shape — tolerant of legacy schemas)
 * @param method    - The selected execution method (optional)
 * @returns `{ videoUrl, imageUrl }` — either may be undefined if truly absent
 */
export function resolveExerciseMedia(
  exercise: Record<string, any>,
  method?: Record<string, any> | null,
): ResolvedMedia {
  const methodMedia = method?.media as Record<string, any> | undefined;
  const allMethods: any[] =
    exercise.execution_methods || exercise.executionMethods || exercise.methods || [];

  // ── Video resolution ──
  const videoUrl: string | undefined =
    methodMedia?.mainVideoUrl ||
    methodMedia?.videoUrl ||
    allMethods.reduce(
      (found: string | undefined, m: any) =>
        found || m?.media?.mainVideoUrl || m?.media?.videoUrl,
      undefined,
    ) ||
    exercise.media?.videoUrl ||
    exercise.videoUrl ||
    exercise.media?.mainVideoUrl ||
    undefined;

  // ── Image resolution ──
  const imageUrl: string | undefined =
    methodMedia?.imageUrl ||
    allMethods.reduce(
      (found: string | undefined, m: any) => found || m?.media?.imageUrl,
      undefined,
    ) ||
    exercise.media?.imageUrl ||
    exercise.imageUrl ||
    exercise.coverImage ||
    exercise.thumbnailUrl ||
    videoUrl || // last resort: video thumbnail
    undefined;

  return { videoUrl, imageUrl };
}
