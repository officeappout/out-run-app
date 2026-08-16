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
 * Home-generator-v2 follow-ups, Task 1 (16.08.2026): recovery-follow-up now checks
 * getCachedRecoveryWorkout(suggestion.id) first — the card renderer needs the same real
 * GeneratedWorkout to render (HeroWorkoutCard, matching the existing rest-day hero card),
 * and generate() already cached its result keyed by the exact Suggestion.id being passed
 * in here. A re-derive call only happens on a genuine cache miss (cap eviction, or a
 * suggestion surviving a reload) — the ordinary path is now a single real
 * generateHomeWorkoutTrio call per suggestion, reused for ranking, rendering, AND
 * starting, not three independent ones. complementary-short has no such renderer need
 * yet (still the generic SuggestionCard per Task 1's scope) — still a deliberate, small,
 * accepted second call, the same "cheap/fast for ranking, real recompute for the one
 * thing actually selected" pattern the map surface already uses (composeTrioDeduped
 * after a settle/tap), not a novel one.
 *
 * Task 2 (16.08.2026): partial-completion also caches by suggestion.id (same reasoning as
 * recovery-follow-up), but for a different reason than rendering — the domain it targets is
 * resolved dynamically (largest real per-domain gap), so a cache-miss re-derive would risk
 * resolving a DIFFERENT domain if today's logged sets changed between ranking and the tap.
 * Reusing the cached result keeps "start" building exactly what was ranked and shown.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { buildRecoveryFollowUpWorkout, getCachedRecoveryWorkout } from '../generators/recovery-follow-up.generator';
import { buildComplementaryShortWorkout } from '../generators/complementary-short.generator';
import { buildPartialCompletionWorkoutFresh, getCachedPartialCompletionWorkout } from '../generators/partial-completion.generator';

export async function suggestionToGeneratedWorkout(
  _context: UserContext,
  suggestion: Suggestion,
): Promise<GeneratedWorkout | null> {
  const profile = useUserStore.getState().profile;
  if (!profile) return null;

  switch (suggestion.generatorId) {
    case 'recovery-follow-up':
      return getCachedRecoveryWorkout(suggestion.id) ?? buildRecoveryFollowUpWorkout(profile);
    case 'complementary-short':
      return buildComplementaryShortWorkout(profile);
    case 'partial-completion':
      return getCachedPartialCompletionWorkout(suggestion.id) ?? buildPartialCompletionWorkoutFresh(profile);
    default:
      return null;
  }
}
