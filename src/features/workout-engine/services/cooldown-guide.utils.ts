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
 *
 * Body focus (owner 26.10, same rule as the warm-up guides — warmup-guide-focus.utils): an
 * upper-body workout gets the upper stretch video, lower → lower, full body → BOTH (upper, then
 * lower). Guide focus = tag `cooldown_upper` / `cooldown_lower`, else muscles. No focus, or no
 * video of that side at this location → one video, as before.
 */
import type { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { methodHasAnyMedia } from '../shared/utils/method-media.utils';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';
import {
  COOLDOWN_GUIDE_TAGS,
  planWarmupGuideBuckets,
  resolveWorkoutBodyFocus,
} from './warmup-guide-focus.utils';

export interface CooldownGuidePick { exercise: Exercise; method: ExecutionMethod }

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
 * The cool-down video(s) for `location`, in play order — chosen by the workout's body focus
 * (from its MAIN exercises). Empty when none is filmed there. Deterministic: the first eligible
 * doc by id within each side, so the generator and the switch plan agree.
 */
export function pickCooldownGuides(
  pool: readonly Exercise[],
  location: ExecutionLocation,
  mainExercises: readonly Exercise[] = [],
  excludeIds?: ReadonlySet<string>,
): CooldownGuidePick[] {
  const methodById = new Map<string, ExecutionMethod>();
  const eligible = pool
    .filter((ex) => isCooldownGuide(ex) && !excludeIds?.has(ex.id))
    .filter((ex) => {
      const m = cooldownGuideMethod(ex, location);
      if (m) methodById.set(ex.id, m);
      return m !== null;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const focus = resolveWorkoutBodyFocus(mainExercises);
  return planWarmupGuideBuckets(eligible, focus, COOLDOWN_GUIDE_TAGS)
    .map((bucket) => ({ exercise: bucket[0], method: methodById.get(bucket[0].id)! }));
}

/** The single (focus-less) cool-down video for `location`, or null. */
export function pickCooldownGuide(
  pool: readonly Exercise[],
  location: ExecutionLocation,
  excludeIds?: ReadonlySet<string>,
): CooldownGuidePick | null {
  return pickCooldownGuides(pool, location, [], excludeIds)[0] ?? null;
}

/** Seconds the cool-down slot lasts: the clip's own length when known, else a 30s hold. */
export function cooldownGuideSeconds(method: ExecutionMethod): number {
  const s = Number((method.media as { videoDurationSeconds?: unknown } | undefined)?.videoDurationSeconds);
  return Number.isFinite(s) && s > 0 ? Math.round(s) : 30;
}
