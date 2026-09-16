'use client';

/**
 * TabataBlockGroup — Tabata finisher Lego.
 *
 * Wraps every exercise sharing the block's ONE clock (work+rest × rounds)
 * inside a single frame — modelled on `SupersetBlockGroup`, but for N
 * members instead of exactly 2, with the segment's own title as header
 * instead of "סופר סט".
 *
 * No skip-rest affordance on the shared rest bar: the block's timing is
 * fully owned by the state machine's tabata clock (fixed
 * work+rest×rounds) — the live player itself never offers a skip during
 * tabata rest, so the background playlist must not either.
 */

import React from 'react';
import StrengthExerciseCard from './StrengthExerciseCard';
import RestProgressBar from './RestProgressBar';
import type { ExerciseEntry, BlockStatus } from '../types';

export interface TabataBlockGroupProps {
  /** Every exercise in the block (already flattened by grouping.utils). */
  exercises: ExerciseEntry[];
  /** Block header label — the segment's own "טבטה" title. */
  title: string;
  cardStatus: BlockStatus;
  /** Index inside `exercises` whose pills are tap-active right now. */
  activeExerciseIndex: number;
  isResting: boolean;
  restTimeLeft?: number;
  formatTime?: (s: number) => string;
  onSaveSet: (
    exerciseIdx: number,
    setIndex: number,
    reps: number,
    sideData?: { left: number; right: number },
  ) => void;
}

export default function TabataBlockGroup({
  exercises,
  title,
  cardStatus,
  activeExerciseIndex,
  isResting,
  restTimeLeft,
  formatTime,
  onSaveSet,
}: TabataBlockGroupProps) {
  const isActive = cardStatus === 'active';
  const isCompleted = cardStatus === 'completed';

  const activeEntry = activeExerciseIndex >= 0 ? exercises[activeExerciseIndex] : null;
  const restDuration = activeEntry?.restDuration || 30;
  const restBar =
    isActive && isResting ? (
      <RestProgressBar
        restTimeLeft={restTimeLeft}
        formatTime={formatTime}
        totalRest={restDuration}
      />
    ) : null;

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
          {title}
        </span>
        <span
          className="text-xs font-medium text-slate-500 dark:text-slate-400"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {exercises.length} תרגילים
        </span>
      </div>

      {/* Member cards stacked, no individual chrome (useSuperFrame=true) */}
      <div className="px-3 pb-2 space-y-2">
        {exercises.map((entry, idx) => {
          const isActiveMember = idx === activeExerciseIndex;
          return (
            <div
              key={entry.exerciseId}
              className={
                isActiveMember
                  ? 'scale-[1.01] ring-1 ring-[#00BAF7]/20 rounded-xl bg-white dark:bg-slate-900 transition-all duration-300'
                  : 'scale-[0.98] saturate-[0.6] opacity-75 transition-all duration-300'
              }
            >
              <StrengthExerciseCard
                entry={entry}
                isTurnActive={isActiveMember}
                useSuperFrame
                onSaveSet={(setIndex, reps, sideData) =>
                  onSaveSet(idx, setIndex, reps, sideData)
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
