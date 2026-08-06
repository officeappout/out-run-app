'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import type { PendingProgramSuggestion } from '@/features/user/core/types/progression.types';

/**
 * ProgramSuggestionCard — post-workout "you might like to add this" card.
 *
 * Separate from StrengthDopamineScreen (that screen is a percentage-bonus
 * reveal animation, not a CTA surface) and separate from LevelUpModal (that's
 * about the CURRENT program's own level, not a different program). This is
 * the natural landing spot for `progression.pendingProgramSuggestions`
 * (written by applyLevelEquivalences, progression.service.ts) — it renders
 * right where `progressionResult` (produced by the same processWorkoutCompletion
 * call that runs applyLevelEquivalences) is already flowing through this screen.
 *
 * No level/percent is invented here — accepting routes to that program's own
 * real questionnaire (startMiniDomainAssessment, domainType: 'skill') via
 * `onAccept`. Dismissing writes nothing (`onDismiss` is local-state-only in
 * the orchestrator) — the suggestion simply reappears next time
 * pendingProgramSuggestions is read, per the product decision that a
 * dismissed suggestion is not resolved, just deferred.
 */

export interface ProgramSuggestionCardProps {
  suggestions: PendingProgramSuggestion[];
  /** Called when the user accepts one suggestion — should route to its questionnaire. */
  onAccept: (targetProgramId: string) => void;
  /** Called when the user dismisses one suggestion — local-only, no Firestore write. */
  onDismiss: (ruleId: string) => void;
}

/** Per-suggestion Hebrew program name, resolved live from the programs collection (no hardcoded list to drift). */
function useProgramName(programId: string): string {
  const [name, setName] = useState(programId);
  useEffect(() => {
    let cancelled = false;
    getProgramByTemplateId(programId)
      .then((prog) => {
        if (!cancelled && prog?.name) setName(prog.name);
      })
      .catch(() => { /* keep the id fallback — non-fatal */ });
    return () => { cancelled = true; };
  }, [programId]);
  return name;
}

function SuggestionRow({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: PendingProgramSuggestion;
  onAccept: (targetProgramId: string) => void;
  onDismiss: (ruleId: string) => void;
}) {
  const programName = useProgramName(suggestion.targetProgramId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/60 rounded-xl p-3"
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <p className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
        {programName}
      </p>
      <button
        onClick={() => onAccept(suggestion.targetProgramId)}
        className="px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-bold rounded-xl shadow-sm active:scale-95 transition-transform"
      >
        בואו נבדוק
      </button>
      <button
        onClick={() => onDismiss(suggestion.ruleId)}
        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        aria-label="דחה הצעה"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export default function ProgramSuggestionCard({ suggestions, onAccept, onDismiss }: ProgramSuggestionCardProps) {
  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border-2 border-amber-200 dark:border-amber-700"
      dir="rtl"
    >
      <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">
        {suggestions.length === 1 ? 'נראה שאתם מוכנים לעוד תוכנית' : 'נראה שאתם מוכנים לעוד כמה תוכניות'}
      </h3>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {suggestions.map((s) => (
            <SuggestionRow key={s.ruleId} suggestion={s} onAccept={onAccept} onDismiss={onDismiss} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
