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
import { X, Activity, Target } from 'lucide-react';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
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
  const hasLyrics =
    nextExercise.executionSteps.length > 0 ||
    nextExercise.muscleGroups.primary.length > 0 ||
    nextExercise.muscleGroups.secondary.length > 0 ||
    !!nextExercise.exerciseGoal;

  return (
    <div className="absolute inset-0">
      {/* ── Layer 1: Background video (z-0) ─────────────────────────────── */}
      <ExerciseVideoPlayer
        key={`rest-preview-${videoKey}`}
        exerciseId={`rest-preview-${videoKey}`}
        videoUrl={nextExercise.videoUrl}
        exerciseName={nextExercise.name}
        exerciseType="reps"
        isPaused={isPaused}
      />

      {/* ── Layer 2: Rest Card — scrollable container, compact by default ── */}
      <div
        className={[
          'absolute inset-x-0 bottom-0 z-10 bg-white dark:bg-[#0F172A] rounded-t-3xl shadow-2xl',
          'transition-[max-height] duration-300 ease-out',
          isLogDrawerOpen
            ? 'max-h-[28vh] overflow-hidden'
            : 'max-h-[36vh] overflow-y-auto overscroll-contain',
        ].join(' ')}
        dir="rtl"
      >
        <div className="px-6 pt-8 pb-16">
          {/* "מנוחה" label */}
          <p
            className="text-sm text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-center mb-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מנוחה
          </p>

          {/* LARGE countdown timer */}
          <div className="flex justify-center mb-5">
            <div
              className="text-7xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {formatTime(restTimeLeft)}
            </div>
          </div>

          {/* Skip rest button — clipped away when drawer is open */}
          <button
            onClick={onSkip}
            className="w-full flex items-center justify-center gap-2 py-4 mb-4 border-2 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 rounded-2xl font-bold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98]"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <X size={20} />
            דלגו על המנוחה
          </button>

          {/* ── Lyrics — below the initial fold, user scrolls to reveal ── */}
          {hasLyrics && (
            <div className="pt-5 border-t border-slate-200 dark:border-slate-700 space-y-5 pb-8">
              <p
                className="text-xs text-slate-400 dark:text-zinc-500 uppercase tracking-wider text-center"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                על התרגיל הבא
              </p>

              {(nextExercise.muscleGroups.primary.length > 0 ||
                nextExercise.muscleGroups.secondary.length > 0) && (
                <div>
                  <h3
                    className="text-base font-bold text-slate-900 dark:text-white mb-3"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    שרירי התרגיל
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {nextExercise.muscleGroups.primary.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5" style={{ fontFamily: 'var(--font-simpler)' }}>
                          שריר ראשי
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {nextExercise.muscleGroups.primary.map((m, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                              <Activity size={12} />{getMuscleGroupLabel(m)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {nextExercise.muscleGroups.secondary.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5" style={{ fontFamily: 'var(--font-simpler)' }}>
                          שרירים משניים
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {nextExercise.muscleGroups.secondary.map((m, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              <Activity size={12} />{getMuscleGroupLabel(m)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {nextExercise.exerciseGoal && (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-start gap-3">
                    <Target size={18} className="flex-shrink-0 mt-0.5 text-cyan-600 dark:text-cyan-400" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                        מטרת התרגיל
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {nextExercise.exerciseGoal}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {nextExercise.executionSteps.length > 0 && (
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3" style={{ fontFamily: 'var(--font-simpler)' }}>
                    דגשים
                  </h3>
                  <ol className="space-y-2">
                    {nextExercise.executionSteps.map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-sm font-bold flex items-center justify-center bg-cyan-500">
                          {i + 1}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 text-sm flex-1" style={{ fontFamily: 'var(--font-simpler)' }}>
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Layer 3: LOG_REPS drawer (z-50) ─────────────────────────────── */}
      <AnimatePresence>
        {isLogDrawerOpen && (
          <motion.div
            key="log-drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="absolute bottom-0 left-0 right-0 z-50"
            style={{ maxHeight: '250px' }}
          >
            {logDrawerNode}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
