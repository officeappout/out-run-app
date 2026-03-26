'use client';

/**
 * RestWithPreview
 *
 * Layer 1 (z-0):  Background video — next exercise, looping, muted
 * Layer 2 (z-10): Solid white card anchored bottom-0.
 *   Default: compact (timer + notification + skip visible).
 *   User scrolls down to reveal lyrics.
 *   When drawer OPEN: overflow-hidden, only timer visible.
 * Layer 3 (z-50): LOG_REPS drawer — slides up from bottom-0.
 */

import React, { type ReactNode } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import type { NextExerciseInfo } from '../hooks/useWorkoutStateMachine';

interface RestWithPreviewProps {
  restTimeLeft: number;
  formatTime: (seconds: number) => string;
  nextExercise: NextExerciseInfo;
  logDrawerNode: ReactNode;
  isLogDrawerOpen: boolean;
  onSkip: () => void;
  isPaused: boolean;
  videoKey: string;
}

export default function RestWithPreview({
  restTimeLeft,
  formatTime,
  nextExercise,
  logDrawerNode,
  isLogDrawerOpen,
  onSkip,
  isPaused,
  videoKey,
}: RestWithPreviewProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* ── Layer 1: Background video (z-0) ─────────────────────────────── */}
      <ExerciseVideoPlayer
        key={`rest-preview-${videoKey}`}
        exerciseId={`rest-preview-${videoKey}`}
        videoUrl={nextExercise.videoUrl}
        exerciseName={nextExercise.name}
        exerciseType="reps"
        isPaused={isPaused}
      />

      {/* ── Layer 2: Rest Card — hidden while log drawer is open to prevent flicker ── */}
      <AnimatePresence>
        {!isLogDrawerOpen && (
          <motion.div
            key="rest-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 z-10 bg-white dark:bg-[#0F172A] rounded-t-3xl shadow-2xl"
            dir="rtl"
          >
            <div
              className="px-6 pt-4"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))' }}
            >
              {/* "מנוחה" label */}
              <p
                className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider text-center mb-1.5"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                מנוחה
              </p>

              {/* Countdown timer */}
              <div className="flex justify-center mb-2.5">
                <div
                  className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {formatTime(restTimeLeft)}
                </div>
              </div>

              {/* Skip rest — minimalist secondary action */}
              <button
                onClick={onSkip}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98]"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <img src="/assets/icons/ui/skip.svg" className="w-4 h-4 dark:invert" alt="Skip" />
                דלגו על המנוחה
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Layer 3: LOG_REPS drawer (z-50) — content-hugging ──────────── */}
      <AnimatePresence>
        {isLogDrawerOpen && (
          <motion.div
            key="log-drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="absolute bottom-0 left-0 right-0 z-50"
          >
            {logDrawerNode}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
