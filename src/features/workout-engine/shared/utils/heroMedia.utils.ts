import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import {
  resolveVideoForLocation,
  findMethodForLocation,
} from '@/features/content/exercises/core/exercise.types';
import { resolveExerciseMedia } from './media-resolution.utils';

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
 *
 * Hero-image fix (2026-10-01, revised): now delegates to `resolveExerciseMedia`
 * (media-resolution.utils.ts) — the same "exhaustive 5-level deep search"
 * resolver `home/page.tsx`, the active workout player, the workout-preview-
 * drawer, and the strength player all already use — instead of the narrower
 * `resolveImageForLocation`/`resolveVideoForLocation` pair this used to call
 * directly. Verified against the live catalog (371 exercises × 3 locations)
 * before switching, not assumed: the narrow pair left 5.7% of combos with no
 * image (21.7% with no video), because it only checks the ONE method
 * `findMethodForLocation` selects — never scanning sibling methods for an
 * image, nor the exercise-root `imageUrl`/`coverImage`/`thumbnailUrl` fields
 * the wide resolver already covers. `resolveExerciseMedia` closes that gap to
 * 0.5% missing image, matching every other surface in the app.
 *
 * The generic Unsplash stock-photo bank that used to live here is removed
 * entirely, not patched — it never matched either the specific exercise or
 * the outdoor-park brand. When (now genuinely rare, ~0.5% of combos) truly no
 * real media resolves at all, `thumbnailUrl`/`videoUrl` are simply `''` — the
 * caller (HeroMediaBackground, HeroWorkoutCard.tsx) renders an on-brand
 * gradient in that case instead of an `<img>`, never a stock photo.
 */
export function resolveHeroMedia(
  ex: WorkoutExercise | undefined,
  location?: string | null,
): { thumbnailUrl: string; videoUrl: string } {
  if (!ex) {
    return { thumbnailUrl: '', videoUrl: '' };
  }

  // Bug fix (orphan commit 1263b9f7, 03.08.2026 — rebased 07.10.2026 onto the
  // 01.10.2026 resolveExerciseMedia migration, see this function's own header
  // comment above): resolveExerciseMedia's cross-method fallback
  // (media-resolution.utils.ts) deep-searches EVERY execution method, any
  // location, once the chosen one has no media of its own — e.g. a 'home'
  // pick with no home-tagged method could surface a park video/photo
  // instead. When this exercise genuinely has no method for `location` at
  // all, skip that location-blind result and fall straight through to the
  // generic gradient fallback (see header comment) rather than trust a
  // cross-location leak.
  const methods = (ex.exercise as any).execution_methods || (ex.exercise as any).executionMethods || [];
  const hasMethodForLocation =
    !location || methods.some((m: any) => m.location === location || m.locationMapping?.includes(location));

  const method = findMethodForLocation(ex.exercise, location);
  const { imageUrl, videoUrl } = hasMethodForLocation
    ? resolveExerciseMedia(ex.exercise, method)
    : { imageUrl: '', videoUrl: '' };

  return { thumbnailUrl: imageUrl || '', videoUrl: videoUrl || '' };
}
