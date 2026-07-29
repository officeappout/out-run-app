'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) HOST.
 *
 * Owns the flag-gated recovery generation so it NEVER runs when the flag is off: home
 * renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted component =
 * no generation = byte-identical.
 *
 * Design direction: recycle existing components, zero new visual language.
 *   Message/summary — REUSES the existing designed completion card (HeroWorkoutCard's
 *     isCompleted celebration, the one that sat in this anchor slot before Block B), NOT a
 *     new message. Stage 1a (#1) feeds its ring the workout-moved daily-strength %
 *     (strengthRingPct) via a synthetic sets pair, so it shows the reliable % (fixing the
 *     stripRingPct 0-bug) regardless of STRENGTH_RING_ENABLED.
 *   Recovery (#3) — the big rest-day recovery HeroWorkoutCard below it (reused pipeline).
 *   Stage 2 (gated) — adds the hero-card next-step OPTIONS (walk / abs / complementary).
 */

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import HeroWorkoutCard, { type CompletionData } from './HeroWorkoutCard';
import { useRecoveryHeroWorkout } from '../hooks/useRecoveryHeroWorkout';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { buildRunnerWorkoutPlanFromGenerated } from '@/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated';

export interface PostWorkoutSmartCloseProps {
  /** The designed completion card's data — reused verbatim from home (same as the
   *  else-branch HeroWorkoutCard celebration). */
  completionData: CompletionData;
  /** Stage 1a (#1): the workout-moved daily-strength % (0-1). Overrides the celebration
   *  ring so it shows the reliable value (fixes the stripRingPct 0-bug), independent of
   *  STRENGTH_RING_ENABLED. */
  strengthRingPct?: number;
  onRequestMore?: () => void;
  ctaLabel?: string;
  onDismissCelebration?: () => void;
  userGender?: 'male' | 'female' | 'other' | null;
}

export default function PostWorkoutSmartClose({
  completionData,
  strengthRingPct,
  onRequestMore,
  ctaLabel,
  onDismissCelebration,
  userGender,
}: PostWorkoutSmartCloseProps) {
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

  // Stage 1a (#1): feed the celebration ring the workout-moved % via a synthetic sets pair
  // (completedSets/targetSets = pct·100 / 100 → getStrengthRingView fillPct = pct). Shows the
  // reliable dailyStrengthPct regardless of STRENGTH_RING_ENABLED. Also drops the thumbnail
  // (ring variant → the ring is the focal metric).
  const completion: CompletionData =
    strengthRingPct != null
      ? {
          ...completionData,
          ring: {
            completedSets: Math.round(Math.max(0, Math.min(1, strengthRingPct)) * 100),
            targetSets: 100,
            avgMinutesPerSet: 0,
          },
        }
      : completionData;

  return (
    <div className="space-y-3">
      {/* Message/summary — the EXISTING designed completion card (A), not a new message. */}
      <HeroWorkoutCard
        workout={{ id: 'completed', title: completion.workoutTitle || '', duration: completion.durationMinutes, difficulty: 2 } as any}
        onStart={() => {}}
        isCompleted
        completionData={completion}
        onRequestMore={onRequestMore}
        ctaLabel={ctaLabel}
        onDismissCelebration={onDismissCelebration}
        userGender={userGender}
      />
      {/* Stage 1b (#3): the big rest-day recovery card below. */}
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
