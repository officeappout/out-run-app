'use client';

import React from 'react';
import ExerciseRow from './ExerciseRow';
import type { CompletedExercise } from '../../utils/summary.utils';

/**
 * ExerciseCategory — section block grouping exercises under a category header.
 *
 * Renders nothing when the group is empty (avoids stray dividers + headings).
 * Otherwise prints a small grey category title (RTL aligned) followed by the
 * list of `ExerciseRow`s with vertical spacing.
 *
 * First child suppresses its top border via `first:border-t-0` (Tailwind).
 *
 * Pure presentational — no state.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-1).
 */

export interface ExerciseCategoryProps {
  /** Hebrew display label for the category (e.g. "חימום", "סופר סט"). */
  title: string;
  /** Exercises that belong to this category. */
  exercises: CompletedExercise[];
}

export default function ExerciseCategory({ title, exercises }: ExerciseCategoryProps) {
  if (exercises.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-slate-50 dark:border-slate-700 first:border-t-0">
      <p className="text-[11px] font-bold text-slate-400 text-right mb-2">{title}</p>
      <div className="space-y-2">
        {exercises.map((ex) => (
          <ExerciseRow key={ex.id} exercise={ex} />
        ))}
      </div>
    </div>
  );
}
