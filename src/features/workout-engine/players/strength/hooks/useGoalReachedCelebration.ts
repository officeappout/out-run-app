'use client';
/**
 * 3e (enable_goal_presence_v1): watches the live set log and fires a small, calm celebration the
 * first time a set reaches a level goal — light haptic + a tiny confetti puff (skipped under
 * reduced motion) + a chip for GOAL_CELEBRATION_MS. Once per goal per session; goals already met
 * in a restored checkpoint don't fire again. No goals passed (flag off) → inert.
 */
import { useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptics';
import { GOAL_CELEBRATION_MS } from '@/features/workout-engine/logic/adaptive/adaptive.config';
import { newlyReachedGoals, type GoalTargetLite, type ReachedGoal } from '../logic/goal-reached';
import type { ExerciseResultLog } from './useWorkoutStateMachine';

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

async function confettiPuff(): Promise<void> {
  try {
    const confetti = (await import('canvas-confetti')).default;
    confetti({
      particleCount: 28, spread: 50, startVelocity: 22, ticks: 70, gravity: 1.3, scalar: 0.7,
      origin: { y: 0.22 }, colors: ['#00C9F2', '#10B981', '#fbbf24'], disableForReducedMotion: true,
    });
  } catch {
    // no confetti — the chip and the haptic still say it
  }
}

export function useGoalReachedCelebration(
  log: readonly ExerciseResultLog[],
  goals: readonly GoalTargetLite[] | undefined,
): ReachedGoal | null {
  const celebrated = useRef<Set<string> | null>(null);
  const [active, setActive] = useState<ReachedGoal | null>(null);

  useEffect(() => {
    if (!goals || goals.length === 0) return;
    if (celebrated.current === null) {
      // First look (incl. a restored checkpoint): whatever is already reached stays quiet.
      celebrated.current = new Set(newlyReachedGoals(log, goals, new Set()).map((r) => r.key));
      return;
    }
    const reached = newlyReachedGoals(log, goals, celebrated.current);
    if (reached.length === 0) return;
    for (const r of reached) celebrated.current.add(r.key);
    setActive(reached[0]);
    hapticLight();
    if (!prefersReducedMotion()) void confettiPuff();
  }, [log, goals]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(null), GOAL_CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [active]);

  return active;
}
