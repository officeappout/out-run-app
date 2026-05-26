'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Star, Calendar } from 'lucide-react';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';

/**
 * GainBreakdownCard — the three-row progression-breakdown card.
 *
 * Shows three contributors to the total active-program gain:
 *   1. Completion (% sets performed vs required)
 *   2. Performance (% of admin-defined goal targets met this session)
 *   3. Consistency (weekly frequency bonus)
 *
 * Plus the divider row with the final `totalGain` percentage.
 *
 * Renders nothing if no successful `progressionResult` is provided yet.
 */

export interface GainBreakdownCardProps {
  /** Live progression result from `useProgressionSync`. */
  progressionResult: WorkoutCompletionResult | null;
  /** Strength sessions logged this week (from `useSummaryAnalytics`). */
  weeklyStrengthSessions: number;
  /** Target strength sessions per week (constant 3, but passed for clarity). */
  weeklyGoalSessions: number;
}

export default function GainBreakdownCard({
  progressionResult,
  weeklyStrengthSessions,
  weeklyGoalSessions,
}: GainBreakdownCardProps) {
  if (!progressionResult?.success) return null;

  const completionPct = progressionResult.sessionCompletionPercent;
  const totalGoals = progressionResult.goalProgress.length;
  const metGoals = progressionResult.goalProgress.filter((g) => g.achieved).length;
  const performancePct = totalGoals > 0 ? Math.round((metGoals / totalGoals) * 100) : 0;
  const consistencyBonus = weeklyStrengthSessions >= weeklyGoalSessions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700"
    >
      <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">פירוט התקדמות</h3>
      <div className="space-y-2">
        {/* Completion */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-500" />
            <span className="text-sm text-slate-700 dark:text-slate-200">השלמת אימון</span>
          </div>
          <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
            {(Math.round(completionPct * 10) / 10).toFixed(1)}%
          </span>
        </div>

        {/* Performance */}
        {totalGoals > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                יעדים שהושגו ({metGoals}/{totalGoals})
              </span>
            </div>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {performancePct}%
            </span>
          </div>
        )}

        {/* Consistency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              עקביות שבועית ({weeklyStrengthSessions}/{weeklyGoalSessions})
            </span>
          </div>
          <span className={`text-sm font-bold tabular-nums ${
            consistencyBonus
              ? 'text-green-600 dark:text-green-400'
              : 'text-slate-400 dark:text-slate-500'
          }`}>
            {consistencyBonus ? '✓ בונוס' : `עוד ${weeklyGoalSessions - weeklyStrengthSessions}`}
          </span>
        </div>

        {/* Total Gain */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800 dark:text-white">סה״כ התקדמות</span>
          <span className="text-base font-black text-cyan-600 dark:text-cyan-400 tabular-nums">
            +{progressionResult.activeProgramGain.totalGain.toFixed(1)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
