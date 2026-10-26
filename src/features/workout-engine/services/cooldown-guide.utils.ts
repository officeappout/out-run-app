/**
 * cooldown-guide.utils — the follow-along cool-down VIDEO ("שחרור") for a location. PURE.
 *
 * Owner decision 26.10: a park workout's cool-down is the filmed follow-along cool-down video,
 * not the home-filmed static stretches (those have media on their HOME method only, so a park
 * session showed home footage). A guide is a catalog doc with `isFollowAlong === true` and
 * `exerciseRole === 'cooldown'`, not a test / placeholder doc, with a method tagged for the
 * location (method.location or locationMapping) that carries media. Same strict, location-only
 * routing as the warm-up's follow-along guides (warmup.service Stage 1): no equipment gate.
 *
 * Used by cooldown.service (generation) and the location-switch plan (preview drawer), so a
 * workout generated at the park and one switched to the park end the same way.
 */
import type { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { methodHasAnyMedia } from '../shared/utils/method-media.utils';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';

const methodsOf = (ex: Exercise): ExecutionMethod[] => ex.execution_methods ?? ex.executionMethods ?? [];

/** A real follow-along cool-down video (any location). */
export function isCooldownGuide(ex: Exercise): boolean {
  return ex.isFollowAlong === true && ex.exerciseRole === 'cooldown' && !isTestOrPlaceholderExercise(ex);
}

/** The guide's method for this location (strict tag match, with media), or null. */
export function cooldownGuideMethod(ex: Exercise, location: ExecutionLocation): ExecutionMethod | null {
  const tagged = methodsOf(ex).filter(
    (m) => m.location === location || (m.locationMapping?.includes(location) ?? false),
  );
  return tagged.find((m) => m.location === location && methodHasAnyMedia(m))
    ?? tagged.find((m) => methodHasAnyMedia(m))
    ?? null;
}

/**
 * The cool-down video for `location`, or null when none is filmed there. Deterministic: the
 * first eligible doc by id, so the generator and the switch plan agree on the same video.
 */
export function pickCooldownGuide(
  pool: readonly Exercise[],
  location: ExecutionLocation,
  excludeIds?: ReadonlySet<string>,
): { exercise: Exercise; method: ExecutionMethod } | null {
  const eligible = pool
    .filter((ex) => isCooldownGuide(ex) && !excludeIds?.has(ex.id))
    .map((ex) => ({ exercise: ex, method: cooldownGuideMethod(ex, location) }))
    .filter((x): x is { exercise: Exercise; method: ExecutionMethod } => x.method !== null)
    .sort((a, b) => a.exercise.id.localeCompare(b.exercise.id));
  return eligible[0] ?? null;
}

/** Seconds the cool-down slot lasts: the clip's own length when known, else a 30s hold. */
export function cooldownGuideSeconds(method: ExecutionMethod): number {
  const s = Number((method.media as { videoDurationSeconds?: unknown } | undefined)?.videoDurationSeconds);
  return Number.isFinite(s) && s > 0 ? Math.round(s) : 30;
}
