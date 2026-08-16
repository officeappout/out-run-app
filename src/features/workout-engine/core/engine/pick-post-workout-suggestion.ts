/**
 * pick-post-workout-suggestion — the post_workout mirror of pick-map-suggestion.ts's
 * suggestionToHybridIntent: `Suggestion` is deliberately generic (doc §4.2, shared across
 * every surface) and does not carry a full `GeneratedWorkout` — this is the one place that
 * knows how to turn a ranked post_workout Suggestion BACK into the real workout to start,
 * by re-deriving it through each generator's own exported single-source-of-truth builder
 * (buildRecoveryFollowUpWorkout / buildComplementaryShortWorkout) rather than a second,
 * hand-copied options object. The safety-net generator has no real content to re-derive
 * (it's a static fallback) and is not handled here — its "start" affordance, if ever tapped,
 * degrades to the ordinary free-walk flow, not a GeneratedWorkout.
 *
 * A second real generateHomeWorkoutTrio call at tap-time (vs. the one already made during
 * ranking) is a deliberate, small, accepted cost — the same "cheap/fast for ranking, real
 * recompute for the one thing actually selected" pattern the map surface already uses
 * (composeTrioDeduped after a settle/tap), not a novel one.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { buildRecoveryFollowUpWorkout } from '../generators/recovery-follow-up.generator';
import { buildComplementaryShortWorkout } from '../generators/complementary-short.generator';

export async function suggestionToGeneratedWorkout(
  _context: UserContext,
  suggestion: Suggestion,
): Promise<GeneratedWorkout | null> {
  const profile = useUserStore.getState().profile;
  if (!profile) return null;

  switch (suggestion.generatorId) {
    case 'recovery-follow-up':
      return buildRecoveryFollowUpWorkout(profile);
    case 'complementary-short':
      return buildComplementaryShortWorkout(profile);
    default:
      return null;
  }
}
