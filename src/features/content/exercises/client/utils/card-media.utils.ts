/**
 * card-media.utils — shared media-resolution helpers for exercise cards.
 *
 * Extracted from ExerciseLibraryCard.tsx (the original list-row card) so
 * ExerciseImageCard.tsx (the redesigned grid card) doesn't fork a second
 * copy of the same location-aware fallback chain. Behavior is unchanged
 * from the original inline functions.
 */

import {
  Exercise,
  MUSCLE_GROUP_LABELS,
  findMethodForLocation,
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
  const method = findMethodForLocation(ex, activeLocation);

  // Try the location-specific method's previewVideo first (deterministic).
  const methodPreview = resolvePreviewForLang(method?.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (methodPreview) return methodPreview;

  // Fall back to exercise-level previewVideo (shared / legacy media).
  const topPreview = resolvePreviewForLang(ex.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (topPreview) return topPreview;

  return undefined;
}

/**
 * Walk the exercise for a Bunny video ID, preferring the execution method that
 * matches the active location. Falls back to exercise-level media so legacy
 * exercises that haven't been split into per-method media always get a thumbnail.
 */
export function pickBunnyVideoId(ex: Exercise, location: string | null): string | null {
  const activeLocation = location ?? 'park';
  const method = findMethodForLocation(ex, activeLocation);

  // 1. Location-specific method — previewVideo
  const mp = resolvePreviewForLang(method?.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (mp?.videoId && mp.provider === 'bunny') return mp.videoId;

  // 2. Location-specific method — fullTutorial
  const mt = resolveTutorialForLang(method?.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (mt?.videoId && mt.provider === 'bunny') return mt.videoId;

  // 3. Exercise-level previewVideo
  const topPreview = resolvePreviewForLang(ex.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (topPreview?.videoId && topPreview.provider === 'bunny') return topPreview.videoId;

  // 4. Exercise-level fullTutorial
  const topTutorial = resolveTutorialForLang(ex.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (topTutorial?.videoId && topTutorial.provider === 'bunny') return topTutorial.videoId;

  // 5. Location-specific method — raw mainVideoUrl (legacy shape: a video
  // that was never split into a structured previewVideo/fullTutorial entry).
  // extractBunnyVideoId pulls the UUID straight out of the URL string —
  // the same helper built for a prior black-screen bug of this exact shape
  // (see bunny.config.ts's doc comment on it).
  const methodRawId = extractBunnyVideoId(method?.media?.mainVideoUrl);
  if (methodRawId) return methodRawId;

  // 6. Exercise-level — raw videoUrl (legacy shape)
  const topRawId = extractBunnyVideoId(ex.media?.videoUrl);
  if (topRawId) return topRawId;

  return null;
}

/**
 * Pick the best static thumbnail URL for an exercise card.
 *
 * Priority:
 *   1. Bunny auto-thumbnail from the location-specific method (deterministic)
 *   2. Manually uploaded imageUrl from the matched method
 *   3. Exercise-level imageUrl (legacy fallback)
 */
export function pickThumbnailUrl(ex: Exercise, location: string | null): string | null {
  // 1. Bunny auto-thumbnail — primary
  const bunnyId = pickBunnyVideoId(ex, location);
  if (bunnyId) return buildBunnyThumbnailUrl(bunnyId);

  // 2. Location-specific method imageUrl
  const activeLocation = location ?? 'park';
  const method = findMethodForLocation(ex, activeLocation);
  if (method?.media?.imageUrl) return method.media.imageUrl;

  // 3. Exercise-level imageUrl — fallback
  if (ex.media?.imageUrl) return ex.media.imageUrl;
  return null;
}
