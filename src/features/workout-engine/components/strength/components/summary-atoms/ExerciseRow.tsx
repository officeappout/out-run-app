'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { CompletedExercise } from '../../utils/summary.utils';

/**
 * ExerciseRow — single exercise line inside the per-category summary list.
 *
 * Renders three pills (RTL order, right → left):
 *   1. Exercise name pill (greyed/opacity when not performed)
 *   2. Completion percentage pill — green ≥100%, neutral grey when not performed
 *   3. Total-reps pill with a TrendingUp arrow
 *
 * Completion math (preserved verbatim from the legacy inline component):
 *   estimatedTarget = max(sets) × sets.length   (only when sets exist)
 *   completionPct  = clamp(round(totalReps / estimatedTarget * 100), 0..150)
 *
 * Unperformed exercises (`sets.length === 0`) show "לא בוצע" + 0%, opacity-60.
 * Includes the explicit `text-xs` font-bump and `line-clamp-1` overflow guard.
 *
 * Pure presentational — no state.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-1).
 */

export interface ExerciseRowProps {
  exercise: CompletedExercise;
}

export default function ExerciseRow({ exercise }: ExerciseRowProps) {
  const wasPerformed = exercise.sets.length > 0;
  const estimatedTarget = wasPerformed
    ? Math.max(...exercise.sets) * exercise.sets.length
    : 0;
  const completionPercent = !wasPerformed
    ? 0
    : estimatedTarget > 0
      ? Math.min(150, Math.round((exercise.totalReps / estimatedTarget) * 100))
      : 0;

  return (
    <div className="flex justify-between items-center">
      {/* Total reps with trend */}
      <div className="flex items-center gap-1 bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-600 shadow-sm">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-slate-800 dark:text-white font-bold text-xs">{exercise.totalReps}</span>
      </div>

      {/* Completion percentage badge */}
      <div className={`px-3 py-1.5 rounded-lg border shadow-sm ${
        completionPercent >= 100
          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
          : !wasPerformed
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600'
      }`}>
        <span className={`font-bold text-xs ${
          completionPercent >= 100
            ? 'text-green-600 dark:text-green-400'
            : !wasPerformed
              ? 'text-slate-400 dark:text-slate-500'
              : 'text-slate-800 dark:text-white'
        }`}>
          {wasPerformed ? `${completionPercent}%` : 'לא בוצע'}
        </span>
      </div>

      {/* Exercise name */}
      <div className={`px-4 py-2 rounded-xl border shadow-sm flex-1 mr-4 ${
        wasPerformed
          ? 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 opacity-60'
      }`}>
        <p className="text-xs font-medium text-slate-800 dark:text-white text-right line-clamp-1">
          {exercise.name}
        </p>
      </div>
    </div>
  );
}
