'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * PauseOverlay — unified full-screen pause veil.
 *
 * Sits above ALL workout states (ACTIVE / INPUT / RESTING) at z-100.
 * Shows a "הפסקה" headline plus two CTAs:
 *   • Resume — orange "התחילו שוב" returns to live training
 *   • Open exit modal — white "סיום אימון" triggers the ExitConfirmModal
 *
 * Pure presentational — the orchestrator owns the conditional visibility
 * (`sm.isPaused && !showExitConfirmModal && workoutState !== 'PREPARING'`)
 * and wraps this component in <AnimatePresence>.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-7).
 */

export interface PauseOverlayProps {
  /** Resume button → unpauses the workout. */
  onResume: () => void;
  /** End-workout button → opens the early-exit confirmation modal. */
  onOpenExitModal: () => void;
}

export default function PauseOverlay({ onResume, onOpenExitModal }: PauseOverlayProps) {
  const handleResume = () => {
    hapticLight();
    onResume();
  };
  const handleOpenExitModal = () => {
    hapticMedium();
    onOpenExitModal();
  };
  return (
    <motion.div
      key="pause-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      dir="rtl"
    >
      <h1
        className="text-4xl font-black text-white mb-12"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        הפסקה
      </h1>

      <div className="w-full max-w-xs space-y-3 px-6">
        <button
          onClick={handleResume}
          className="w-full h-16 bg-[#F97316] rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/30"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <Play size={22} fill="white" />
          התחילו שוב
        </button>
        <button
          onClick={handleOpenExitModal}
          className="w-full h-16 bg-white rounded-2xl font-bold text-slate-800 text-lg active:scale-[0.98] transition-transform shadow-lg"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          סיום אימון
        </button>
      </div>
    </motion.div>
  );
}
