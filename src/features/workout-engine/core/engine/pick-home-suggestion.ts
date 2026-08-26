/**
 * pick-home-suggestion — the home (pre-workout) mirror of pick-post-workout-suggestion.ts:
 * turns a ranked home Suggestion BACK into the real GeneratedWorkout to start, by re-deriving it
 * through each generator's own exported builder, rather than a second, hand-copied build.
 * 17.8 build-plan, Section 1, commit 4/4 (26.08.2026).
 *
 * full-strength: resolveFullStrengthWorkout is itself cache-first (checks
 * getCachedFullStrengthWorkout before building) and de-dupes concurrent calls for the same id —
 * the SAME call the carousel's own background-prefetch and onSettle triggers already make, so
 * "start" tapping a suggestion whose Tier-2 hasn't resolved yet just awaits the same in-flight
 * build instead of kicking off a second, redundant one.
 *
 * recovery-follow-up: mirrors pick-post-workout-suggestion.ts's own handling exactly (that
 * generator is 'home'-eligible too, per the 17.8 build-plan's Stage 4 rest-day work) — cache
 * first, a real re-derive only on a genuine cache miss.
 *
 * safety-net / route: no real GeneratedWorkout to re-derive (safety-net is a static fallback;
 * route leads to a map/run flow, not a home workout) — not handled here, same
 * degrade-to-caller-fallback posture pick-post-workout-suggestion.ts already established for
 * safety-net on the post_workout surface.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveFullStrengthWorkout } from '../generators/full-strength.generator';
import { buildRecoveryFollowUpWorkout, getCachedRecoveryWorkout } from '../generators/recovery-follow-up.generator';

export async function suggestionToHomeGeneratedWorkout(
  context: UserContext,
  suggestion: Suggestion,
): Promise<GeneratedWorkout | null> {
  const profile = useUserStore.getState().profile;
  if (!profile) return null;

  switch (suggestion.generatorId) {
    case 'full-strength':
      return resolveFullStrengthWorkout(suggestion.id, profile, context);
    case 'recovery-follow-up':
      return getCachedRecoveryWorkout(suggestion.id) ?? buildRecoveryFollowUpWorkout(profile);
    default:
      return null;
  }
}
