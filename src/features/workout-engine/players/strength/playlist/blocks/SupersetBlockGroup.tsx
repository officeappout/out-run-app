'use client';

/**
 * SupersetBlockGroup — Paired-exercise Lego.
 *
 * Wraps two `StrengthExerciseCard` instances inside one superset frame:
 *   - Shared header label   (e.g. "סופר סט (2 תרגילים)")
 *   - Shared rest progress bar at the bottom while RESTING
 *   - Cross-exercise tap broker so tapping the wrong (non-cursor)
 *     partner pulses the active partner's first incomplete pill
 *
 * The two cards underneath stay fully independent React subtrees, so
 * each row inside still owns its own DataEntryModal — no shared modal
 * state ever leaks across the pair.
 */

import React, { useCallback, useRef, useState } from 'react';
import StrengthExerciseCard from './StrengthExerciseCard';
import RestProgressBar from './RestProgressBar';
import { findFirstIncompleteSet } from '../utils/set-status.utils';
import type { ExerciseEntry, BlockStatus } from '../types';
import type { TapVerdict } from './StrengthSetRow';

export interface SupersetBlockGroupProps {
  /** The two paired exercise entries (already equalized by grouping.utils). */
  exercises: [ExerciseEntry, ExerciseEntry] | ExerciseEntry[];
  cardStatus: BlockStatus;
  /** Index inside `exercises` whose pills are tap-active right now. */
  activeExerciseIndex: number;
  isResting: boolean;
  restTimeLeft?: number;
  formatTime?: (s: number) => string;
  onSkipRest?: () => void;
  onSaveSet: (
    exerciseIdx: number,
    setIndex: number,
    reps: number,
    sideData?: { left: number; right: number },
  ) => void;
}

export default function SupersetBlockGroup({
  exercises,
  cardStatus,
  activeExerciseIndex,
  isResting,
  restTimeLeft,
  formatTime,
  onSkipRest,
  onSaveSet,
}: SupersetBlockGroupProps) {
  const isActive = cardStatus === 'active';
  const isCompleted = cardStatus === 'completed';

  // ── Cross-exercise pulse coordinator ───────────────────────────────
  // When the user taps the wrong partner, we surface a pulse on the
  // ACTIVE partner's first incomplete pill.  Each card already owns
  // its own internal pulse state for within-card mis-taps; we extend
  // that by passing a `pulseSeedCounter` to force a re-render whenever
  // we need the active card to flash its correct pill again.
  const [crossPulseTick, setCrossPulseTick] = useState(0);
  const crossPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireCrossPulse = useCallback(() => {
    setCrossPulseTick((n) => n + 1);
    if (crossPulseTimerRef.current) clearTimeout(crossPulseTimerRef.current);
    crossPulseTimerRef.current = setTimeout(() => {
      // The active card's internal pulse clears itself after 1.2s; this
      // timer only exists to prevent a memory leak if we unmount mid-
      // animation.  No state to reset here.
    }, 1200);
  }, []);

  // Verdict the non-active card calls when one of its rows is tapped.
  // We hand back `'pulse'` (the row will NOT open its own modal) and
  // synchronously fire the cross-exercise pulse on the active sibling.
  const buildCrossExerciseTap = useCallback(
    (idx: number) => (): TapVerdict => {
      if (idx === activeExerciseIndex) return 'open'; // shouldn't happen
      const activeEntry = exercises[activeExerciseIndex];
      if (!activeEntry) return 'block';
      const firstIncomplete = findFirstIncompleteSet(activeEntry);
      if (firstIncomplete >= 0) {
        fireCrossPulse();
      }
      return 'pulse';
    },
    [activeExerciseIndex, exercises, fireCrossPulse],
  );

  // ── Rest progress bar (shared at the bottom of the frame) ─────────
  const activeEntry =
    activeExerciseIndex >= 0 ? exercises[activeExerciseIndex] : null;
  const restDuration = activeEntry?.restDuration || 30;
  const restBar =
    isActive && isResting ? (
      <RestProgressBar
        restTimeLeft={restTimeLeft}
        formatTime={formatTime}
        totalRest={restDuration}
        onSkip={onSkipRest}
      />
    ) : null;
  // (Solo cards render their own inline RestProgressBar — see
  // StrengthExerciseCard.  Here we keep the bar at the shared frame
  // level because both partner cards consume the same rest window.)

  return (
    <div
      className={[
        'relative rounded-2xl shadow-md shadow-slate-200/60 dark:shadow-slate-900/40 transition-all duration-500 overflow-visible',
        isActive
          ? 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 scale-[1.01]'
          : isCompleted
            ? 'border-2 border-[#00BAF7] bg-[#F0FDFF] dark:bg-slate-800'
            : 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 opacity-70',
      ].join(' ')}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between px-4 pt-3 pb-2">
        <span
          className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[60%]"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          סופר סט ({exercises.length} תרגילים)
        </span>
        <span
          className="text-xs font-medium text-slate-500 dark:text-slate-400"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {exercises.length} תרגילים
        </span>
      </div>

      {/* Two cards stacked, no individual chrome (useSuperFrame=true) */}
      <div className="px-3 pb-2 space-y-2">
        {exercises.map((entry, idx) => {
          const isActivePartner = idx === activeExerciseIndex;
          return (
            <div
              key={`${entry.exerciseId}-${isActivePartner ? crossPulseTick : 0}`}
              className={
                isActivePartner
                  ? 'scale-[1.01] ring-1 ring-[#00BAF7]/20 rounded-xl bg-white dark:bg-slate-900 transition-all duration-300'
                  : 'scale-[0.98] saturate-[0.6] opacity-75 transition-all duration-300'
              }
            >
              <StrengthExerciseCard
                entry={entry}
                isTurnActive={isActivePartner}
                useSuperFrame
                onSaveSet={(setIndex, reps, sideData) =>
                  onSaveSet(idx, setIndex, reps, sideData)
                }
                onCrossExerciseTap={
                  !isActivePartner ? buildCrossExerciseTap(idx) : undefined
                }
              />
            </div>
          );
        })}
      </div>

      {restBar}
    </div>
  );
}

