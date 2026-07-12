'use client';

import React, { useCallback } from 'react';
import { Target } from 'lucide-react';
import SwapIcon from '@/features/workout-engine/components/SwapIcon';
import {
  Exercise as FirestoreExercise,
  getLocalizedText,
} from '@/features/content/exercises';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { buildExerciseVolumeLabel } from '../../utils/exercise-display.utils';

interface ExerciseCardProps {
  /** Engine wrapper for the exercise being rendered. */
  exercise: EngineWorkoutExercise;
  /** Pre-resolved image URL (offline blob fallback already applied by parent). */
  cachedImageUrl: string;
  /** Whether this card sits inside a superset block (tones down its border). */
  isSuperset: boolean;
  /** Tap-to-open-detail handler.  Stable reference required for memoisation. */
  onTap?: (exercise: EngineWorkoutExercise) => void;
  /** Swap handler.  Stable reference required for memoisation. */
  onSwap?: (exercise: FirestoreExercise, level: number) => void;
  /**
   * Replaces the sets/reps volume line (Stage 3 UX): tabata members show
   * the work-interval ("20 שנ'") instead of strength language — sets/reps
   * are irrelevant to a time-based block. Undefined = normal volume label.
   */
  volumeOverride?: string;
}

/**
 * Standard (non-pyramid) exercise row card.
 *
 * Wrapped in `React.memo` so a re-render of the parent
 * `GeneratedWorkoutExerciseList` for unrelated reasons (audio toggle,
 * favorites state, etc.) does NOT cascade into the per-card subtree —
 * a card only re-renders when one of its props changes by reference.
 */
function ExerciseCardImpl({
  exercise,
  cachedImageUrl,
  isSuperset,
  onTap,
  onSwap,
  volumeOverride,
}: ExerciseCardProps) {
  const name = typeof exercise.exercise.name === 'string'
    ? exercise.exercise.name
    : getLocalizedText(exercise.exercise.name, 'he');

  const isGoal = exercise.isGoalExercise === true;
  const uniLabel = exercise.exercise.symmetry === 'unilateral' ? ' (לכל צד)' : '';
  const volume = volumeOverride ?? buildExerciseVolumeLabel(exercise, uniLabel);

  // Bound click handlers — stable as long as `onTap` / `onSwap` / `exercise`
  // references stay the same.  Eliminates the inline arrow allocations that
  // previously fired on every parent render inside the flatMap loop.
  const handleTap = useCallback(() => {
    onTap?.(exercise);
  }, [onTap, exercise]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') onTap?.(exercise);
  }, [onTap, exercise]);

  const handleSwap = useCallback(() => {
    onSwap?.(exercise.exercise, exercise.programLevel || 1);
  }, [onSwap, exercise]);

  return (
    <div
      dir="rtl"
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      className={`relative w-full bg-white dark:bg-[#1E293B] rounded-lg overflow-hidden border-[0.5px] cursor-pointer active:scale-[0.98] transition-transform h-[70px] ${
        isGoal
          ? 'ring-2 ring-cyan-400 border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/20'
          : isSuperset
            ? 'border-[#E0E9FF]/40 dark:border-slate-800/50 shadow-none'
            : 'border-[#E0E9FF] dark:border-slate-700 shadow-sm'
      }`}
    >
      <div className="flex items-stretch h-full">
        <div className="w-[70px] flex-shrink-0 h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={name} className="w-full h-full object-cover" src={cachedImageUrl} loading="lazy" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center py-1.5 pr-3 pl-1">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-[14px] leading-tight truncate ${isGoal ? 'text-cyan-700 dark:text-cyan-300' : 'text-black dark:text-white'}`}>
              {name}
            </span>
            {isGoal && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] font-bold rounded-full border border-cyan-200 flex-shrink-0">
                <Target size={9} />
                יעד
              </span>
            )}
          </div>
          <div className={`text-[13px] font-normal mt-0.5 ${isGoal ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-800 dark:text-slate-300'}`}>
            {volume}
          </div>
        </div>
        <div className="flex items-center pl-3 flex-shrink-0">
          <SwapIcon size={18} onClick={handleSwap} isSwapped={exercise.wasSwapped} />
        </div>
      </div>
    </div>
  );
}

const ExerciseCard = React.memo(ExerciseCardImpl);
ExerciseCard.displayName = 'ExerciseCard';

export default ExerciseCard;
