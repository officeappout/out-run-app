'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) HOST.
 *
 * Owns the flag-gated fetches/generation so they NEVER run when the flag is off: home
 * renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted component =
 * zero generation = byte-identical. Hooks can't be called conditionally, so the gate MUST
 * be the mount boundary — not an `if` inside a top-level render.
 *
 * Design direction: recycle existing components, zero new visual language.
 *   Stage 1a (#1) — the framing subtitle is the reused summary-strip RING (strengthRingPct,
 *     the workout-moved daily-strength %, fixing the stripRingPct 0-bug).
 *   Stage 1b (#3) — the stretch tiles are the reused BIG rest-day recovery card
 *     (HeroWorkoutCard fed the recovery-video trio), started via the canonical
 *     GeneratedWorkout → active_workout_data → /workouts/[id]/active hand-off.
 *   Stage 2 (gated) — adds the hero-card next-step OPTIONS (walk / abs / complementary) via
 *     the full assembler, per-kind routing.
 */

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PostWorkoutSuggestionCard from './PostWorkoutSuggestionCard';
import HeroWorkoutCard from './HeroWorkoutCard';
import { buildPostWorkoutSuggestion, type PostWorkoutSuggestionInput } from '../utils/postWorkoutSuggestion';
import { useRecoveryHeroWorkout } from '../hooks/useRecoveryHeroWorkout';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { buildRunnerWorkoutPlanFromGenerated } from '@/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated';

export interface PostWorkoutSmartCloseProps
  extends Pick<PostWorkoutSuggestionInput, 'endMode' | 'intendedDurationMin' | 'domainsCompleted' | 'trainedCore'> {
  /** Stage 1a (#1): the STRENGTH daily-goal ring % (0-1) — the workout-moved value
   *  (dailyProgress.dailyStrengthPct captured at completion), replacing the framing subtitle
   *  and fixing the stripRingPct 0-bug. */
  strengthRingPct?: number;
  userGender?: 'male' | 'female' | 'other' | null;
}

export default function PostWorkoutSmartClose({
  strengthRingPct,
  userGender,
  ...handoff
}: PostWorkoutSmartCloseProps) {
  const router = useRouter();
  const suggestion = buildPostWorkoutSuggestion(handoff);
  // Light recovery-video builder (getAllExercises + pure map) — flag-gated by the mount.
  const recoveryWorkout = useRecoveryHeroWorkout();

  const handleStartRecovery = useCallback(() => {
    if (!recoveryWorkout) return;
    // Canonical GeneratedWorkout → runner hand-off (the drawer path, minus the preview hop).
    const id = `recovery-${Date.now()}`;
    const plan = buildRunnerWorkoutPlanFromGenerated(recoveryWorkout, { id });
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('active_workout_data', JSON.stringify(plan));
      sessionStorage.setItem('currentWorkoutPlanId', id);
    }
    router.push(`/workouts/${id}/active`);
  }, [recoveryWorkout, router]);

  if (!suggestion) return null;

  return (
    <div className="space-y-3">
      <PostWorkoutSuggestionCard suggestion={suggestion} ringPct={strengthRingPct} />
      {/* Stage 1b (#3): the existing BIG rest-day recovery card — NOT new tiles. */}
      {recoveryWorkout && (
        <HeroWorkoutCard
          workout={generatedToHeroWorkout(recoveryWorkout)}
          exercises={recoveryWorkout.exercises}
          isRestDay
          onStart={handleStartRecovery}
          userGender={userGender}
          variant="active"
        />
      )}
    </div>
  );
}
