'use client';

/**
 * PreWorkoutCardRenderer — the pre-workout hero carousel's per-suggestion card router
 * (pre-workout hero carousel Stage 1, 17.08.2026, David-approved plan).
 *
 * Mirrors PostWorkoutCardRenderer.tsx's shape exactly: branches by `suggestion.generatorId`,
 * not a new `Suggestion.cardVariant` field, for the same reason (Suggestion stays generic
 * across every surface). Renders only genuine `Suggestion` objects — the carousel's OTHER
 * slide (the trio-driven "hero" recommended workout) is not a Suggestion at all and is
 * rendered directly by StatsOverview.tsx via the shared ScaledHeroCard, not through this
 * router.
 *
 * Stage 1 scope: only `recovery-follow-up` is registered for the 'pre_workout' surface today
 * (recovery-follow-up.generator.ts), so that is the only real branch. Anything else falls
 * through to the generic SuggestionCard, exactly like PostWorkoutCardRenderer's own
 * defensive fallback — ready for future pre_workout generators (e.g. the deferred
 * route/step-deficit reconciliation) without needing a rewrite here.
 */

import { ScaledHeroCard } from './ScaledHeroCard';
import { SuggestionCard } from '@/features/workout-engine/core/components/SuggestionCard';
import { getCachedRecoveryWorkout } from '@/features/workout-engine/core/generators/recovery-follow-up.generator';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';

interface PreWorkoutCardRendererProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
  userGender?: 'male' | 'female' | 'other' | null;
}

export function PreWorkoutCardRenderer({
  suggestion,
  onStart,
  isStarting,
  userGender,
}: PreWorkoutCardRendererProps) {
  if (suggestion.generatorId === 'recovery-follow-up') {
    const workout = getCachedRecoveryWorkout(suggestion.id);
    if (workout) {
      return <ScaledHeroCard workout={workout} onStart={onStart} userGender={userGender} />;
    }
    // Defensive: cache miss (cap eviction, or a suggestion surviving a reload) — degrade
    // to the generic card rather than render nothing.
  }

  return <SuggestionCard suggestion={suggestion} onStart={onStart} isStarting={isStarting} />;
}
