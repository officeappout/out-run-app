/**
 * station-outdoor-media — never show a home/office video at an outdoor stop (17.10.2026).
 *
 * At a stop the engine always SELECTS an outdoor method (selectMethodForContext at
 * location 'park' returns park-tagged methods only). But the player's media resolver
 * (resolveExerciseMedia) falls back to ANY method's video when the selected one has none,
 * in authored order after the park methods — so a park method without its own video plays
 * the exercise's HOME video (e.g. leg raises on the living-room floor at a park stop).
 *
 * Rule: an outdoor-tagged method whose resolved video belongs only to non-outdoor methods is
 * not station content. It is removed from the exercise for hybrid stops; if no outdoor method
 * is left, the exercise is excluded at stops (better than a home video). A method whose
 * resolved video is its own, another outdoor method's, the exercise root's, or none at all
 * is kept.
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';

const OUTDOOR_LOCATIONS = new Set(['park', 'street']);

export function isOutdoorMethod(m: ExecutionMethod | undefined | null): boolean {
  if (!m) return false;
  if (OUTDOOR_LOCATIONS.has(m.location as string)) return true;
  return (m.locationMapping ?? []).some((l) => OUTDOOR_LOCATIONS.has(l as string));
}

function mediaHolds(m: ExecutionMethod, key: string): boolean {
  return !!m.media && JSON.stringify(m.media).includes(key);
}

/**
 * True when the video the player would show for `method` comes from a non-outdoor method
 * (home/office/…) — i.e. the selected outdoor method has no video of its own and no other
 * outdoor method supplies one.
 */
export function resolvesToIndoorVideo(exercise: Exercise, method: ExecutionMethod): boolean {
  const methods: ExecutionMethod[] = exercise.execution_methods || exercise.executionMethods || [];
  const res = resolveExerciseMedia(exercise as unknown as Record<string, unknown>, method as unknown as Record<string, unknown>);
  const key = res.bunnyVideoId ?? res.videoUrl;
  if (!key) return false;
  if (mediaHolds(method, key)) return false;
  const owners = methods.filter((m) => mediaHolds(m, key));
  if (owners.length === 0) return false; // exercise root / none — not a method-specific home video
  return !owners.some(isOutdoorMethod);
}

const cache = new WeakMap<Exercise, Exercise | null>();

/**
 * The exercise as a stop may use it: outdoor methods that would play a home/office video are
 * removed. Returns the same object when nothing changes, and null when no outdoor method is
 * left (exclude at stops). Exercises with no outdoor method at all are returned unchanged —
 * the park selector already excludes them.
 */
export function withOutdoorVideoMethods(exercise: Exercise): Exercise | null {
  const hit = cache.get(exercise);
  if (hit !== undefined) return hit;
  const key = exercise.execution_methods ? 'execution_methods' : exercise.executionMethods ? 'executionMethods' : null;
  const methods: ExecutionMethod[] = key ? (exercise[key] as ExecutionMethod[]) : [];
  const outdoor = methods.filter(isOutdoorMethod);
  let out: Exercise | null = exercise;
  if (key && outdoor.length > 0) {
    const leaky = new Set(outdoor.filter((m) => resolvesToIndoorVideo(exercise, m)));
    if (leaky.size > 0) {
      const kept = methods.filter((m) => !leaky.has(m));
      out = kept.some(isOutdoorMethod) ? ({ ...exercise, [key]: kept } as Exercise) : null;
    }
  }
  cache.set(exercise, out);
  return out;
}

/** Map a pool through withOutdoorVideoMethods, dropping excluded exercises. */
export function outdoorVideoSafePool(pool: Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  for (const ex of pool) {
    const safe = withOutdoorVideoMethods(ex);
    if (safe) out.push(safe);
  }
  return out;
}
