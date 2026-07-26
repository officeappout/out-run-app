import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import {
  resolveVideoForLocation,
  resolveImageForLocation,
} from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// Movement-group fallback images (high-quality Unsplash)
// ============================================================================
export const MOVEMENT_GROUP_FALLBACKS: Record<string, string> = {
  horizontal_push: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80',
  vertical_push:   'https://images.unsplash.com/photo-1598971639058-a0c1e5321546?auto=format&fit=crop&w=800&q=80',
  horizontal_pull:  'https://images.unsplash.com/photo-1597452485669-2c7bb5fef90d?auto=format&fit=crop&w=800&q=80',
  vertical_pull:   'https://images.unsplash.com/photo-1598971457999-ca4ef48a9a71?auto=format&fit=crop&w=800&q=80',
  squat:           'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80',
  hinge:           'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=800&q=80',
  core:            'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
  isolation:       'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80',
};
export const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80';

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
 * Priority: execution-method media -> legacy exercise.media -> movement-group fallback.
 */
export function resolveHeroMedia(
  ex: WorkoutExercise | undefined,
  location?: string | null,
): { thumbnailUrl: string; videoUrl: string } {
  if (!ex) {
    return { thumbnailUrl: DEFAULT_HERO_IMAGE, videoUrl: '' };
  }

  const image = resolveImageForLocation(ex.exercise, location);
  const video = resolveVideoForLocation(ex.exercise, location);

  const thumbnailUrl =
    image ||
    MOVEMENT_GROUP_FALLBACKS[ex.exercise.movementGroup || ''] ||
    DEFAULT_HERO_IMAGE;

  return { thumbnailUrl, videoUrl: video || '' };
}
