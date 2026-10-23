'use client';

import React from 'react';

import { ExerciseCategory } from './summary-atoms';
import type { CompletedExercise } from '../utils/summary.utils';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

/**
 * ExerciseBreakdownCard — "סיכום אימון" card listing exercises by category.
 *
 * Owns the Hebrew category-label dictionary (`warmup` → "חימום" etc.) so the
 * orchestrator doesn't have to know about UI copy.  Falls back to the raw
 * category id when a label is missing, keeping the component future-proof
 * for new categories added by the workout generator.
 *
 * Shows an empty-state row when no exercises were completed.
 */

export interface ExerciseBreakdownCardProps {
  /** Completed exercises grouped by category (from `useSummaryAnalytics`). */
  groupedExercises: Record<string, CompletedExercise[]>;
  /** Raw completed list — only used for the empty-state guard. */
  completedExercises: CompletedExercise[];
}

export default function ExerciseBreakdownCard({
  groupedExercises,
  completedExercises,
}: ExerciseBreakdownCardProps) {
  const t = useT(player);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-v2-card overflow-hidden shadow-v2-card">
      {/* Header */}
      <div className="p-4 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
        <span className="text-xs font-bold text-slate-400">{t('exerciseBreakdown.total')}</span>
        <span className="text-xs font-bold text-slate-400">{t('exerciseBreakdown.performed')}</span>
        <h3 className="text-slate-800 dark:text-white font-bold text-base">{t('exerciseBreakdown.title')}</h3>
      </div>

      {Object.entries(groupedExercises).map(([category, exercises]) => (
        <ExerciseCategory
          key={category}
          title={t('exerciseBreakdown.category', { category })}
          exercises={exercises}
        />
      ))}

      {completedExercises.length === 0 && (
        <div className="p-8 text-center text-slate-400">
          <p>{t('exerciseBreakdown.empty')}</p>
        </div>
      )}
    </div>
  );
}
