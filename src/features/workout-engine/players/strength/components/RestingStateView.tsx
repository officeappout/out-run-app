'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RestWithPreview from './RestWithPreview';

/**
 * RestingStateView — RESTING phase orchestrator.
 *
 * Wraps the canonical `RestWithPreview` rest-timer/next-exercise lyrics card
 * and overlays an optional floating "coach hint" notification above the
 * bottom rest drawer (only when range comparison flagged fail / overachieve
 * AND we're not on the last set AND the log drawer isn't already open).
 *
 * Coach-hint UX:
 *   • "fail"        — orange 💪 "קשה מדי?" + optional swap-exercise CTA
 *   • "overachieve" — emerald 🔥 "קל מדי?" auto-difficulty hint
 *
 * Pure presentational — orchestrator owns the visibility condition
 * (`workoutState === 'RESTING'`) and pipes the pre-rendered log drawer slot.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-11).
 */

type CoachHint = 'fail' | 'overachieve' | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NextExerciseShape = any;

export interface RestingStateViewProps {
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
  /** Remaining rest time in seconds (drives the circular countdown). */
  restTimeLeft: number;
  /** Time formatter (mm:ss). */
  formatTime: (t: number) => string;
  /** Snapshot of the next exercise displayed in the rest preview card. */
  nextExercise: NextExerciseShape;
  /** Pre-rendered log-drawer slot (slot from LogDrawerContent). */
  logDrawerNode: React.ReactNode;
  /** Whether the bottom log drawer is currently open. */
  isLogDrawerOpen: boolean;
  /** Whether the workout is currently paused (pauses the rest timer). */
  isPaused: boolean;
  /** Active segment index — used to build the rest preview's video remount key. */
  currentSegmentIndex: number;
  /** Active exercise index — used to build the rest preview's video remount key. */
  currentExerciseIndex: number;
  /** Coach hint flag — null hides the floating notification. */
  coachHint: CoachHint;
  /** 1-based current round (coach hint suppressed on the last set). */
  currentRound: number;
  /** Total rounds for the active exercise. */
  totalRounds: number;
  /** Skip-rest action (fired by the timer's skip button). */
  onSkipRest: () => void;
  /** Dismiss-hint action (close × button + always fires before onSwap). */
  onDismissHint: () => void;
  /** Optional swap-exercise CTA (only shown alongside "fail" coach hint). */
  onSwap?: () => void;
}

export default function RestingStateView({
  fadeIn,
  restTimeLeft,
  formatTime,
  nextExercise,
  logDrawerNode,
  isLogDrawerOpen,
  isPaused,
  currentSegmentIndex,
  currentExerciseIndex,
  coachHint,
  currentRound,
  totalRounds,
  onSkipRest,
  onDismissHint,
  onSwap,
}: RestingStateViewProps) {
  const videoKey = isLogDrawerOpen
    ? `current-${currentSegmentIndex}-${currentExerciseIndex}`
    : `next-${currentSegmentIndex}-${currentExerciseIndex}`;

  const showCoachHint = coachHint && !isLogDrawerOpen && currentRound < totalRounds;

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
    >
      <RestWithPreview
        restTimeLeft={restTimeLeft}
        formatTime={formatTime}
        nextExercise={nextExercise}
        logDrawerNode={logDrawerNode}
        isLogDrawerOpen={isLogDrawerOpen}
        onSkip={onSkipRest}
        isPaused={isPaused}
        videoKey={videoKey}
      />

      {/* Coach hint — compact floating notification above rest drawer (hidden on last set) */}
      <AnimatePresence>
        {showCoachHint && (
          <motion.div
            key="coach-hint"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="absolute left-4 right-4 z-[60]"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 160px)' }}
            dir="rtl"
          >
            <div className={`rounded-2xl px-3.5 py-2.5 shadow-lg backdrop-blur-sm flex items-center gap-2.5 ${
              coachHint === 'fail'
                ? 'bg-orange-50/90 border border-orange-200/60 dark:bg-orange-950/80 dark:border-orange-700/50'
                : 'bg-emerald-50/90 border border-emerald-200/60 dark:bg-emerald-950/80 dark:border-emerald-700/50'
            }`}>
              <span className="text-base flex-shrink-0">{coachHint === 'fail' ? '💪' : '🔥'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold leading-tight ${coachHint === 'fail' ? 'text-orange-700 dark:text-orange-300' : 'text-emerald-700 dark:text-emerald-300'}`} style={{ fontFamily: 'var(--font-simpler)' }}>
                  {coachHint === 'fail' ? 'קשה מדי?' : 'קל מדי?'}
                </p>
                <p className={`text-[11px] leading-tight mt-0.5 ${coachHint === 'fail' ? 'text-orange-600/80 dark:text-orange-400/80' : 'text-emerald-600/80 dark:text-emerald-400/80'}`} style={{ fontFamily: 'var(--font-simpler)' }}>
                  {coachHint === 'fail'
                    ? 'תוכל/י להחליף לגרסה קלה יותר'
                    : 'כל הכבוד! הקושי יעלה אוטומטית'}
                </p>
              </div>
              {onSwap && coachHint === 'fail' && (
                <button
                  onClick={() => { onDismissHint(); onSwap(); }}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/60 active:scale-[0.96] transition-transform"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/icons/ui/swap.svg" className="w-3.5 h-3.5 dark:invert" alt="" />
                  <span className="text-[11px] font-bold text-orange-700 dark:text-orange-300 whitespace-nowrap" style={{ fontFamily: 'var(--font-simpler)' }}>
                    החלפה
                  </span>
                </button>
              )}
              <button
                onClick={onDismissHint}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-slate-400/70 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="סגור"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
