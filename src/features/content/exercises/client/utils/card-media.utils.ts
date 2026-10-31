/**
 * card-media.utils — shared media-resolution helpers for exercise cards.
 *
 * Extracted from ExerciseLibraryCard.tsx (the original list-row card) so
 * ExerciseImageCard.tsx (the redesigned grid card) doesn't fork a second
 * copy of the same location-aware fallback chain.
 */

import {
  Exercise,
  ExecutionMethod,
  ExecutionLocation,
  MUSCLE_GROUP_LABELS,
  resolvePreviewForLang,
  resolveTutorialForLang,
} from '../../core/exercise.types';
import { buildBunnyThumbnailUrl, extractBunnyVideoId } from '@/lib/bunny/bunny.config';

export function pickPrimaryMuscle(ex: Exercise): { he: string } | null {
  const m = ex.primaryMuscle ?? ex.muscleGroups?.[0];
  if (!m) return null;
  return MUSCLE_GROUP_LABELS[m] ?? null;
}

export function pickPreviewVideo(ex: Exercise, location: string | null) {
  // Apply the product fallback rule: when no location is active default to 'park'.
  const activeLocation = location ?? 'park';
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  const method = methods.find(
    (m) => m.location === activeLocation || m.locationMapping?.includes(activeLocation as ExecutionLocation),
  ) ?? methods[0];

  // Try the location-specific method's previewVideo first (deterministic).
  const methodPreview = resolvePreviewForLang(method?.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (methodPreview) return methodPreview;

  // Fall back to exercise-level previewVideo (shared / legacy media).
  const topPreview = resolvePreviewForLang(ex.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (topPreview) return topPreview;

  return undefined;
}

/** Bunny video ID from ONE method's own media fields — structured first, then a raw URL. */
function bunnyIdForMethod(method: ExecutionMethod | null | undefined): string | null {
  if (!method) return null;
  const mp = resolvePreviewForLang(method.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (mp?.videoId && mp.provider === 'bunny') return mp.videoId;
  const mt = resolveTutorialForLang(method.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (mt?.videoId && mt.provider === 'bunny') return mt.videoId;
  // Legacy shape: a video that was never split into a structured
  // previewVideo/fullTutorial entry. extractBunnyVideoId pulls the UUID
  // straight out of the raw URL string — the same helper built for a prior
  // black-screen bug of this exact shape (see bunny.config.ts's doc comment).
  return extractBunnyVideoId(method.media?.mainVideoUrl);
}

/** Bunny video ID from the exercise's OWN top-level media (not per-method). */
function bunnyIdForExercise(ex: Exercise): string | null {
  const topPreview = resolvePreviewForLang(ex.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (topPreview?.videoId && topPreview.provider === 'bunny') return topPreview.videoId;
  const topTutorial = resolveTutorialForLang(ex.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (topTutorial?.videoId && topTutorial.provider === 'bunny') return topTutorial.videoId;
  return extractBunnyVideoId(ex.media?.videoUrl);
}

/** Best image for ONE method: its Bunny auto-thumbnail, else its manually uploaded imageUrl. */
function imageForMethod(method: ExecutionMethod | null | undefined): string | null {
  const bunnyId = bunnyIdForMethod(method);
  if (bunnyId) return buildBunnyThumbnailUrl(bunnyId);
  return method?.media?.imageUrl ?? null;
}

/**
 * Pick the best static thumbnail URL for an exercise card.
 *
 * Round 4, #9 — previous chain only ever tried ONE method (whichever
 * findMethodForLocation resolved to) before giving up to the gradient. If
 * that one method existed (e.g. a real 'home' method, satisfying the round-2
 * #7 location filter) but happened to have no image/video of its own, the
 * card showed the gradient even though a DIFFERENT method on the same
 * exercise had a perfectly good photo. Fixed by trying multiple candidates
 * in priority order, each fully (Bunny thumbnail, then manual imageUrl),
 * before moving to the next tier — instead of resolving to a single method
 * up front and only ever checking that one:
 *   1. The exact selected location's method, if a location filter is active.
 *   2. The park method (the app's default location) — skipped if the
 *      selected location already WAS park (tier 1 covered it).
 *   3. ANY method with usable media, regardless of location.
 *   4. The exercise's own top-level media (legacy exercises never split
 *      into per-method media).
 *   5. Gradient — only when truly nothing above resolved.
 */
export function pickThumbnailUrl(ex: Exercise, location: string | null): string | null {
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];

  if (location) {
    const exact = methods.find(
      (m) => m.location === location || m.locationMapping?.includes(location as ExecutionLocation),
    );
    const img = imageForMethod(exact);
    if (img) return img;
  }

  if (location !== 'park') {
    const parkMethod = methods.find(
      (m) => m.location === 'park' || m.locationMapping?.includes('park'),
    );
    const img = imageForMethod(parkMethod);
    if (img) return img;
  }

  for (const m of methods) {
    const img = imageForMethod(m);
    if (img) return img;
  }

  const exBunnyId = bunnyIdForExercise(ex);
  if (exBunnyId) return buildBunnyThumbnailUrl(exBunnyId);
  if (ex.media?.imageUrl) return ex.media.imageUrl;

  return null;
}
