'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import type { EvaluatedGoal } from '../hooks/useGoalEvaluation';

/**
 * LevelGoalsChecklist — admin-defined goals card with per-goal achievement state.
 *
 * Each row shows:
 *   • A circular checkbox (filled cyan when achieved)
 *   • The goal label
 *   • `bestValue / targetValue {unit}` with localized unit ("חזרות" / "שניות")
 *   • The bonus % (active or muted)
 *
 * Plus a divider row with the total achieved-bonus percentage.
 *
 * Renders nothing when no goals are evaluated for the session.
 */

export interface LevelGoalsChecklistProps {
  /** Goals annotated with achievement state, from `useGoalEvaluation`. */
  evaluatedGoals: EvaluatedGoal[];
}

export default function LevelGoalsChecklist({ evaluatedGoals }: LevelGoalsChecklistProps) {
  if (evaluatedGoals.length === 0) return null;

  const totalBonus = evaluatedGoals.reduce(
    (s, g) => s + (g.achieved ? (g.progressBonus ?? 5) : 0),
    0,
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700">
      <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">יעדי רמה</h3>
      <div className="space-y-3">
        {evaluatedGoals.map((goal, idx) => {
          const bonus = goal.progressBonus ?? 5;
          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex items-center gap-3"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                  goal.achieved
                    ? 'bg-[#00C9F2] border-[#00C9F2]'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {goal.achieved && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <span
                className={`text-sm flex-1 ${
                  goal.achieved
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {goal.label}
              </span>
              <span className="text-xs tabular-nums text-slate-400">
                {goal.bestValue}/{goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
              </span>
              <span className={`text-xs font-bold tabular-nums min-w-[3rem] text-left ${
                goal.achieved ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-300 dark:text-slate-600'
              }`}>
                {goal.achieved ? `+${bonus}%` : `(${bonus}%)`}
              </span>
            </motion.div>
          );
        })}
      </div>
      {/* Session Goal Total */}
      <div className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800 dark:text-white">סה״כ יעדים באימון</span>
        <span className="text-base font-black text-cyan-600 dark:text-cyan-400 tabular-nums">
          +{totalBonus}%
        </span>
      </div>
    </div>
  );
}
