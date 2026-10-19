/**
 * The shape of today's cached home carousel (src/lib/fast-startup/daily-record-cache.ts's
 * homeCarouselCache) and the pure helpers around it — no React, unit-tested.
 */
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

export interface HomeCarouselSnapshot {
  suggestions: Suggestion[];
  /** suggestion.id → the hero workout its card rendered (real Tier-2 content only). */
  heroWorkouts: Record<string, GeneratedWorkout>;
}

/** Bump when anything that changes the carousel's inputs is added to the key. */
export const HOME_CAROUSEL_CTX_KEY = 'home:v1';

export function isHomeCarouselSnapshot(v: unknown): v is HomeCarouselSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<HomeCarouselSnapshot>;
  return (
    Array.isArray(s.suggestions) &&
    s.suggestions.length > 0 &&
    s.suggestions.every((x) => !!x && typeof x.id === 'string' && typeof x.generatorId === 'string') &&
    !!s.heroWorkouts &&
    typeof s.heroWorkouts === 'object'
  );
}

/** Snapshot of what the carousel shows right now; lookup = the generators' REAL caches. */
export function buildHomeCarouselSnapshot(
  suggestions: Suggestion[],
  lookup: (s: Suggestion) => GeneratedWorkout | null | undefined,
): HomeCarouselSnapshot {
  const heroWorkouts: Record<string, GeneratedWorkout> = {};
  for (const s of suggestions) {
    const w = lookup(s);
    if (w) heroWorkouts[s.id] = w;
  }
  return { suggestions, heroWorkouts };
}
