'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) ANCHOR host.
 *
 * Owns the flag-gated recovery generation so it NEVER runs when the flag is off: home
 * renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted component =
 * no generation = byte-identical.
 *
 * Item 2 split: the summary STRIP floats to the top (PostWorkoutStripHost); this anchor host
 * now holds the recovery card (#3) and, in Stage 2, the hero-card next-step OPTIONS
 * (walk / abs / complementary). Design law: recycle existing components, zero new visuals.
 */

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import HeroWorkoutCard from './HeroWorkoutCard';
import { useRecoveryHeroWorkout } from '../hooks/useRecoveryHeroWorkout';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { buildRunnerWorkoutPlanFromGenerated } from '@/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated';

export interface PostWorkoutSmartCloseProps {
  userGender?: 'male' | 'female' | 'other' | null;
}

export default function PostWorkoutSmartClose({ userGender }: PostWorkoutSmartCloseProps) {
  const router = useRouter();
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

  if (!recoveryWorkout) return null;

  return (
    <div className="space-y-3">
      {/* Stage 1b (#3): the big rest-day recovery card. */}
      <HeroWorkoutCard
        workout={generatedToHeroWorkout(recoveryWorkout)}
        exercises={recoveryWorkout.exercises}
        isRestDay
        onStart={handleStartRecovery}
        userGender={userGender}
        variant="active"
      />
    </div>
  );
}
