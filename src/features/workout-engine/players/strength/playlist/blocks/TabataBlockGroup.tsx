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
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { ExerciseEntry, BlockStatus } from '../types';
import PlayerMethodInfo from '../../../../components/method-info/PlayerMethodInfo';
import { useMethodInfoSheetV1 } from '../../../../components/method-info/useMethodInfoSheetV1';

export interface TabataBlockGroupProps {
  /** Every exercise in the block (already flattened by grouping.utils). */
  exercises: ExerciseEntry[];
  /** Block header label — the segment's own "טבטה" title. */
  title: string;
  /** enable_method_info_sheet_v1: the block's clock, for the "i" that explains tabata. */
  tabataConfig?: { workSec: number; restSec: number; rounds: number };
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
  tabataConfig,
  cardStatus,
  activeExerciseIndex,
  isResting,
  restTimeLeft,
  formatTime,
  onSaveSet,
}: TabataBlockGroupProps) {
  const t = useT(player);
  const methodInfoOn = useMethodInfoSheetV1();
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
        {methodInfoOn && tabataConfig ? (
          <span className="flex min-w-0 max-w-[60%] items-center gap-1.5">
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
              {title}
            </span>
            <PlayerMethodInfo
              kind="tabata"
              label={title}
              entries={exercises}
              // Each row's `sets` is the block's real rounds per member (tabataRoundsPerMember).
              tabata={{ ...tabataConfig, cycles: exercises[0]?.sets ?? null }}
            />
          </span>
        ) : (
        <span
          className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[60%]"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {title}
        </span>
        )}
        <span
          className="text-xs font-medium text-slate-500 dark:text-slate-400"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {t('strengthPlayer.groups.count', { n: String(exercises.length) })}
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
