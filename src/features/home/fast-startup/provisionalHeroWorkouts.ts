/**
 * Hero workouts restored from today's cached home carousel (enable_fast_startup_v1).
 *
 * Kept OUTSIDE the generators' own Tier-2 caches on purpose: resolveHeroWorkout reads the
 * real cache first and falls back to this only when the real one has nothing yet, so the
 * card paints instantly from the cache and swaps in place the moment the fresh Tier-2 build
 * lands. Starting a workout never reads this map — the tap path (suggestionToHomeGeneratedWorkout)
 * awaits the fresh build — so a cached card can only ever START today's freshly generated workout.
 * Empty (flag off) → resolveHeroWorkout behaves exactly as before.
 */
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

const provisional = new Map<string, GeneratedWorkout>();

export function seedProvisionalHeroWorkouts(byId: Record<string, GeneratedWorkout>): void {
  provisional.clear();
  for (const [id, w] of Object.entries(byId)) if (w) provisional.set(id, w);
}

export function getProvisionalHeroWorkout(suggestionId: string): GeneratedWorkout | undefined {
  return provisional.size ? provisional.get(suggestionId) : undefined;
}

export function clearProvisionalHeroWorkouts(): void {
  provisional.clear();
}
