'use client';
/**
 * 3e (enable_goal_presence_v1): the in-workout "goal reached" chip — calm, ≤1.2 s, top-centre,
 * non-blocking (pointer-events none). Reduced motion → a plain fade. Rendered inside the
 * runner's own root (absolute, z-20 over its z-0 playlist / z-10 active layer).
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { ReachedGoal } from '../logic/goal-reached';

export default function GoalReachedChip({ reached }: { reached: ReachedGoal | null }) {
  const t = useT(player);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {reached && (
        <motion.div
          key={reached.key}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
        >
          <div className="rounded-full bg-white/95 dark:bg-slate-800/95 shadow-v2-card px-4 py-2 text-sm font-bold text-slate-800 dark:text-white">
            {t('strengthRunner.goalReached', {
              value: String(reached.goal.targetValue),
              name: reached.goal.exerciseName,
              unit: reached.goal.unit === 'reps' ? 'reps' : 'other',
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
