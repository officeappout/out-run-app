'use client';
/**
 * Phase card (enable_workout_tutorial_v1, pilot S2): "now the warm-up" / "now the main part" over
 * the player for two seconds (or until tapped). Never holds the clock.
 */
import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dumbbell, Flame } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { WorkoutPhase } from './workout-tutorial';
import TutorialPortal from './TutorialPortal';

const SHOW_MS = 2000;

export default function WorkoutPhaseCard({ phase, onDone }: { phase: WorkoutPhase | null; onDone: () => void }) {
  const t = useT(player);
  useEffect(() => {
    if (!phase) return;
    const id = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(id);
  }, [phase, onDone]);
  return (
    <TutorialPortal passThrough>
    <AnimatePresence>
      {phase && (
        <motion.button
          key={phase}
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto absolute inset-x-6 top-1/3 flex items-center gap-3 rounded-v2-card bg-white p-4 text-start shadow-v2-float"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <IconTile icon={phase === 'warmup' ? Flame : Dumbbell} tone="accent" />
          <span className="min-w-0">
            <span className="block text-[20px] font-black text-v2-ink">{t(phase === 'warmup' ? 'workoutTutorial.phase.warmup' : 'workoutTutorial.phase.main')}</span>
            <span className="block text-[13px] font-bold text-v2-muted">{t(phase === 'warmup' ? 'workoutTutorial.phase.warmupSub' : 'workoutTutorial.phase.mainSub')}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
    </TutorialPortal>
  );
}
