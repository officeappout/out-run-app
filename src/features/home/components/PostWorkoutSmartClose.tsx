'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) HOST.
 *
 * Owns the flag-gated recovery generation so it NEVER runs when the flag is off: home
 * renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted component =
 * no generation = byte-identical.
 *
 * Design direction: recycle existing components, zero new visual language.
 *   Summary — REUSES the existing PostWorkoutSummaryStrip (the designer's daily-strength-goal
 *     ring card), fed the WORKOUT-MOVED % (strengthRingPct = dailyProgress.dailyStrengthPct)
 *     instead of stripRingPct → fixes the 0-bug (stripRingPct hard-zeros on non-scheduled days).
 *   Recovery (#3) — the big rest-day recovery HeroWorkoutCard below it (reused pipeline).
 *   Stage 2 (gated) — adds the hero-card next-step OPTIONS (walk / abs / complementary).
 */

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PostWorkoutSummaryStrip from './PostWorkoutSummaryStrip';
import HeroWorkoutCard from './HeroWorkoutCard';
import { useRecoveryHeroWorkout } from '../hooks/useRecoveryHeroWorkout';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { buildRunnerWorkoutPlanFromGenerated } from '@/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';

export interface PostWorkoutSmartCloseProps {
  workoutType?: string;
  durationMinutes: number;
  exerciseCount?: number;
  calories?: number;
  onDismiss: () => void;
  userGender?: 'male' | 'female' | 'other' | null;
}

export default function PostWorkoutSmartClose({
  workoutType,
  durationMinutes,
  exerciseCount,
  calories,
  onDismiss,
  userGender,
}: PostWorkoutSmartCloseProps) {
  const router = useRouter();
  // Item 4: the ring reflects WEEKLY volume (completed ÷ weekly budget) — the same
  // reliable source as the profile "נפח שבועי" card (useWeeklyVolumeStore), NOT the daily
  // pct. Read here (flag-gated mount) → byte-identical when off. NOT clamped → >1 = over-goal.
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const weeklyRingPct = strength.weeklyBudget > 0 ? strength.totalSetsCompleted / strength.weeklyBudget : 0;
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

  return (
    <div className="space-y-3">
      {/* Summary — the EXISTING daily-strength-goal ring card, fed the reliable % (0-bug fix). */}
      <PostWorkoutSummaryStrip
        workoutType={workoutType}
        ringPct={weeklyRingPct}
        durationMinutes={durationMinutes}
        exerciseCount={exerciseCount}
        calories={calories}
        onDismiss={onDismiss}
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
