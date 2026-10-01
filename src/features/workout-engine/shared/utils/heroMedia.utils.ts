import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import {
  resolveVideoForLocation,
  resolveImageForLocation,
} from '@/features/content/exercises/core/exercise.types';

/**
 * Pick the exercise whose media drives the workout hero.
 *
 * Fallback hierarchy (never falls straight to the warmup):
 *   1. a MAIN-role exercise (exerciseRole 'main' or unset) that HAS a non-empty
 *      video for the current location — the ideal hero
 *   2. any MAIN-role exercise (image-only main beats a warmup)
 *   3. on a recovery-only day (no main at all): the first exercise that actually
 *      has a video — this is the real workout, so we honour it
 *   4. last resort: exercises[0]
 *
 * NOTE: the old `reps > 0` gate was dropped on purpose — it rejected time-based
 * (isometric / hold / mobility) exercises and let the whole filter fall through
 * to the warmup. Role is the correct signal, not rep count.
 */
export function pickHeroExercise(
  exercises?: WorkoutExercise[],
  location?: string | null,
): WorkoutExercise | undefined {
  if (!exercises?.length) return undefined;

  const isMain = (ex: WorkoutExercise) =>
    ex.exercise.exerciseRole === 'main' || ex.exercise.exerciseRole == null;
  const hasVideo = (ex: WorkoutExercise) =>
    !!resolveVideoForLocation(ex.exercise, location);

  // 1. main-role exercise with a real video for this location
  const mainWithVideo = exercises.find((ex) => isMain(ex) && hasVideo(ex));
  if (mainWithVideo) return mainWithVideo;

  // 2. any main-role exercise
  const anyMain = exercises.find(isMain);
  if (anyMain) return anyMain;

  // 3. recovery-only day → first exercise that actually has a video
  const anyWithVideo = exercises.find(hasVideo);
  if (anyWithVideo) return anyWithVideo;

  // 4. last resort
  return exercises[0];
}

/**
 * Resolve thumbnail & video URLs for a given WorkoutExercise.
 * Priority: execution-method media -> legacy exercise.media.
 *
 * Hero-image fix (2026-10-01): there is ALWAYS a real video for a composed
 * workout exercise — resolveImageForLocation now derives a real Bunny
 * thumbnail from it even when the video exists only via the legacy
 * mainVideoUrl field (see that function's own doc comment). The generic
 * Unsplash stock-photo bank that used to live here (a movement-group-keyed
 * fallback, then an absolute default) is removed entirely, not patched —
 * it never matched either the specific exercise or the outdoor-park brand.
 * When (rare) truly no real media resolves at all, `thumbnailUrl` is simply
 * `''` — the caller (HeroMediaBackground, HeroWorkoutCard.tsx) renders an
 * on-brand gradient in that case instead of an `<img>`, never a stock photo.
 */
export function resolveHeroMedia(
  ex: WorkoutExercise | undefined,
  location?: string | null,
): { thumbnailUrl: string; videoUrl: string } {
  if (!ex) {
    return { thumbnailUrl: '', videoUrl: '' };
  }

  const image = resolveImageForLocation(ex.exercise, location);
  const video = resolveVideoForLocation(ex.exercise, location);

  return { thumbnailUrl: image, videoUrl: video || '' };
}
