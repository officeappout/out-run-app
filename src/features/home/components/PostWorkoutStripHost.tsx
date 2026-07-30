'use client';

/**
 * PostWorkoutStripHost — Block B (BLOCK_B_SMART_CLOSE_V1) top-strip host.
 *
 * Item 2: the post-workout summary strip floats to the TOP of home (the motivation-banner
 * slot), while the recovery card + Stage 2 next-step options stay in the anchor
 * (PostWorkoutSmartClose). This host owns the weekly-volume read (useWeeklyVolumeStore) so
 * the subscription runs ONLY when the strip is mounted — home renders it only behind the
 * flag → byte-identical when off.
 *
 * Ring = WEEKLY volume (completed ÷ weekly budget), the same reliable source as the profile
 * "נפח שבועי" card. NOT clamped → >1 shows as over-goal (the strip handles the display).
 */

import React from 'react';
import PostWorkoutSummaryStrip from './PostWorkoutSummaryStrip';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';

export interface PostWorkoutStripHostProps {
  workoutType?: string;
  durationMinutes: number;
  exerciseCount?: number;
  calories?: number;
  onDismiss: () => void;
}

export default function PostWorkoutStripHost({
  workoutType,
  durationMinutes,
  exerciseCount,
  calories,
  onDismiss,
}: PostWorkoutStripHostProps) {
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const weeklyRingPct = strength.weeklyBudget > 0 ? strength.totalSetsCompleted / strength.weeklyBudget : 0;

  return (
    <PostWorkoutSummaryStrip
      workoutType={workoutType}
      ringPct={weeklyRingPct}
      durationMinutes={durationMinutes}
      exerciseCount={exerciseCount}
      calories={calories}
      onDismiss={onDismiss}
    />
  );
}
