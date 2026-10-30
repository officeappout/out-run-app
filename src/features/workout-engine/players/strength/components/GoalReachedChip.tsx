'use client';
/**
 * 3e (enable_goal_presence_v1): the in-workout "goal reached" chip — calm, ≤1.2 s, top-centre,
 * non-blocking (pointer-events none). Reduced motion → a plain fade. Rendered inside the
 * runner's own root (absolute, z-20 over its z-0 playlist / z-10 active layer).
 * The chip frame itself is the shared FloatingStatusChip.
 */
import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import FloatingStatusChip from '../../shared/v2/FloatingStatusChip';
import type { ReachedGoal } from '../logic/goal-reached';

export default function GoalReachedChip({ reached }: { reached: ReachedGoal | null }) {
  const t = useT(player);
  return (
    <FloatingStatusChip chipKey={reached?.key ?? null}>
      {reached &&
        t('strengthRunner.goalReached', {
          value: String(reached.goal.targetValue),
          name: reached.goal.exerciseName,
          unit: reached.goal.unit === 'reps' ? 'reps' : 'other',
        })}
    </FloatingStatusChip>
  );
}
