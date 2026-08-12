'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';

/**
 * ResumeWorkoutDialog — crash-recovery resume-offer dialog.
 *
 * Shown by active/page.tsx (behind STRENGTH_RESUME_CHECKPOINT_ENABLED)
 * BEFORE StrengthRunner mounts, when a non-expired checkpoint
 * (useWorkoutPersistence.ts, restoreCheckpoint) is found for the current
 * workoutId. Renders a centered card at z-[100] (the documented "sheets"
 * tier — see .cursorrules) with:
 *   • A cyan circle history icon
 *   • Bilingual heading + supportive subtext, with elapsed-time context
 *   • A primary "המשך אימון" cyan CTA — resumes from the checkpoint
 *   • A secondary underlined "להתחיל מחדש" link — discards it, starts fresh
 *
 * Deliberately does NOT dismiss on backdrop tap — unlike ExitConfirmModal's
 * "continue" default, there is no safe implicit choice here; the user must
 * pick one of the two explicit actions.
 *
 * Visual precedent: ExitConfirmModal.tsx (same directory) — backdrop blur,
 * rounded-3xl card, spring transition, RTL, cyan gradient primary CTA +
 * underlined secondary. z-[100] used instead of ExitConfirmModal's z-[90]:
 * that value is not in .cursorrules' documented Z-Index Budget table — a
 * known collision risk another modal was deliberately moved off of.
 */

export interface ResumeWorkoutDialogProps {
  /** Elapsed workout time (seconds) at the point the checkpoint was saved — shown for context. */
  elapsedTime: number;
  /** Resume — caller seeds StrengthRunner's initialCheckpoint prop from the restored checkpoint. */
  onResume: () => void;
  /** Start Over — caller calls clearWorkoutCheckpoint() and proceeds with no checkpoint. */
  onStartOver: () => void;
}

export default function ResumeWorkoutDialog({ elapsedTime, onResume, onStartOver }: ResumeWorkoutDialogProps) {
  const minutes = Math.max(1, Math.round(elapsedTime / 60));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
        dir="rtl"
      >
        <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-[#00AEEF] flex items-center justify-center">
          <History size={22} className="text-[#00AEEF]" />
        </div>

        <h2
          className="text-xl font-black text-slate-900 dark:text-white mb-2"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          להמשיך מאיפה שעצרת?
        </h2>
        <p
          className="text-sm text-slate-500 dark:text-slate-400 mb-7"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          מצאנו אימון פעיל שלא הסתיים — עצרת אחרי כ-{minutes} דקות. אפשר להמשיך בדיוק מאותה נקודה.
        </p>

        <button
          onClick={onResume}
          className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          המשך אימון
        </button>

        <button
          onClick={onStartOver}
          className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          להתחיל מחדש
        </button>
      </motion.div>
    </div>
  );
}
