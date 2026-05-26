'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { CompletedExercise } from '../../utils/summary.utils';

/**
 * PersonalRecords — sky-tinted trophy card listing newly-set personal records.
 *
 * Filters its input list by `isPersonalRecord === true`.  Returns `null` when
 * the filtered list is empty (no card frame is rendered).
 *
 * Each row shows: total reps (bold) — exercise name (slimmer, RTL).
 *
 * Pure presentational — no state.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-1).
 */

export interface PersonalRecordsProps {
  /** Full list of completed exercises; the component filters by `isPersonalRecord`. */
  exercises: CompletedExercise[];
}

export default function PersonalRecords({ exercises }: PersonalRecordsProps) {
  const records = exercises.filter((ex) => ex.isPersonalRecord);

  if (records.length === 0) return null;

  return (
    <div className="bg-sky-100 dark:bg-sky-900/30 rounded-2xl p-4 border border-sky-200 dark:border-sky-800/50">
      <div className="flex items-center justify-between mb-3">
        <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400" />
        <h3 className="text-sky-600 dark:text-sky-400 font-bold text-base">שיא חדש!</h3>
      </div>
      <div className="space-y-2">
        {records.map((ex) => (
          <div key={ex.id} className="flex justify-between items-center">
            <span className="text-slate-800 dark:text-slate-200 font-bold">{ex.totalReps}</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm">{ex.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
