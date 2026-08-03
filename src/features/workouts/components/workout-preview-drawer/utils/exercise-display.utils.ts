/**
 * Display-layer helpers for individual exercise cards in WorkoutPreviewDrawer.
 *
 * Pure functions that translate an `EngineWorkoutExercise` into the small
 * pieces of UI text / URLs each card needs.  Keeping them outside the JSX
 * tree means they can be memoised at the card level and unit-tested in
 * isolation without a render environment.
 */
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';

/** Resolve exercise thumbnail image URL via shared 5-level deep search */
export function resolveExerciseImage(ex: EngineWorkoutExercise): string {
  const method = ex.method as any;
  // Bug fix: resolveExerciseMedia only stays method-scoped while the
  // assigned method (`ex.method` — already chosen for this exercise's real
  // location at generation time) has media of its own. Once that method has
  // NEITHER a Bunny preview NOR mainVideoUrl/videoUrl NOR imageUrl, its
  // internal fallback deep-searches every OTHER execution method regardless
  // of location — silently substituting e.g. a park photo for a home pick.
  // Detect that "own method has nothing" case here and use the existing
  // generic placeholder instead of trusting a cross-location leak.
  const ownMethodHasMedia = !!(
    method?.media?.mainVideoUrl ||
    method?.media?.videoUrl ||
    method?.media?.imageUrl ||
    method?.media?.previewVideo?.he?.videoId ||
    method?.media?.previewVideo?.en?.videoId
  );
  if (!ownMethodHasMedia) {
    return '/images/park-placeholder.svg';
  }
  const { imageUrl } = resolveExerciseMedia(ex.exercise as any, method);
  return imageUrl || '/images/park-placeholder.svg';
}

/**
 * Build the "12 חזרות" / "8-12 חזרות" / "30 שניות" volume label rendered
 * on a non-pyramid exercise card.  Mirrors the inline IIFE that currently
 * lives inside `GeneratedWorkoutExerciseList`'s standard card branch.
 *
 * Phase 4 — Tier-3 PresentationFormatter:
 *   When `ex.formattedRepRange` is already populated by the engine's
 *   `annotateRepRanges()` pass, this helper simply appends the unilateral
 *   suffix and returns.  The legacy fallback path (manual format) is kept
 *   for non-engine surfaces (e.g. Firestore-restored sessions) that may
 *   carry a `WorkoutExercise` shape that pre-dates Phase 4.
 *
 * @param ex          The engine workout exercise wrapper.
 * @param uniLabel    Suffix appended for unilateral movements (e.g. " (לכל צד)").
 * @returns           A Hebrew-formatted volume string ready for display.
 */
export function buildExerciseVolumeLabel(
  ex: EngineWorkoutExercise,
  uniLabel: string,
): string {
  // Prefer the pre-computed string from Tier-3 PresentationFormatter when present.
  if (ex.formattedRepRange) {
    return `${ex.formattedRepRange}${uniLabel}`;
  }

  // Legacy fallback — kept verbatim so non-engine WorkoutExercise inputs
  // (Firestore-restored sessions, share-link payloads) still render correctly.
  const isTimeBased = ex.isTimeBased === true;
  const unit = isTimeBased ? 'שניות' : 'חזרות';

  if (ex.repsRange && ex.repsRange.min !== ex.repsRange.max) {
    return `${ex.repsRange.min}-${ex.repsRange.max} ${unit}${uniLabel}`;
  }
  return isTimeBased ? `${ex.reps} שניות` : `${ex.reps} חזרות${uniLabel}`;
}
