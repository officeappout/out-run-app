'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Loader2 } from 'lucide-react';

/**
 * DeleteWorkoutConfirmModal — shared MEDIUM-weight delete confirmation for
 * completed workouts.
 *
 * Structural/visual precedent (read in full before building this):
 *   - src/features/workout-engine/players/strength/components/ExitConfirmModal.tsx
 *   - src/features/workout-engine/players/strength/components/ResumeWorkoutDialog.tsx
 * Reused exactly: backdrop (blur(8px) + rgba(0,0,0,0.4)), spring card
 * transition (damping 22 / stiffness 300), rounded-3xl centered card,
 * icon-in-circle header, dir="rtl", font-simpler typography, backdrop-tap
 * dismisses to the safe choice (here: Cancel — deleting is never the
 * implicit default, matching ExitConfirmModal's convention, not
 * ResumeWorkoutDialog's deliberate no-implicit-choice one).
 *
 * Deliberately NOT the type-to-confirm pattern used by the account-deletion
 * flow in src/features/home/components/SettingsModal.tsx (~line 1952) —
 * that is a heavier, higher-stakes confirm (irreversible account loss).
 * Deleting a single workout only needs a clear title + short warning body +
 * two real buttons (Cancel / Delete), which is why the two buttons here are
 * a real side-by-side pair (borrowed from SettingsModal's delete-footer
 * layout) rather than Resume/Exit's asymmetric "button + underlined link".
 *
 * z-[100] — the documented "Full-screen overlays (search, sheets,
 * contribution wizard, ResumeWorkoutDialog...)" tier in .cursorrules'
 * Z-Index Budget table. Same value ResumeWorkoutDialog uses; NOT
 * ExitConfirmModal's z-[90], which the ResumeWorkoutDialog header comment
 * flags as undocumented / a known collision risk.
 *
 * Fully self-contained and generic — no assumption about which screen
 * renders it. Intended call sites (at least 4):
 *   - Aerobic workout summary (delete a completed run/walk)
 *   - Home activity history list (delete any past workout row)
 *   - Strength history detail (delete a completed strength session)
 *   - Free-run summary (delete a completed free run)
 */

export interface DeleteWorkoutConfirmModalProps {
  /** Whether the modal is currently visible — component owns its own AnimatePresence/exit transition. */
  isOpen: boolean;
  /** Human-readable, already-localized activity type label (e.g. "אימון כוח", "ריצה", "הליכה + כוח"). */
  activityLabel: string;
  /** Human-readable, already-formatted workout date (e.g. "12.08.2026" or "היום"). */
  dateLabel: string;
  /**
   * XP that will be reversed if the delete proceeds. Pass 0 (or omit) when
   * the workout never awarded XP — the copy omits the XP clause entirely
   * rather than stating a false/misleading "0 XP will be reversed".
   */
  xpToReverse?: number;
  /**
   * Confirm — caller performs the actual delete + XP-reversal write.
   * May return a Promise; while it is pending the Delete button shows a
   * spinner and both buttons (and backdrop-tap) are disabled.
   */
  onConfirm: () => void | Promise<void>;
  /**
   * Cancel — dismisses without deleting. Also fired on backdrop tap
   * (the safe implicit choice, per ExitConfirmModal's convention).
   * Disabled while a delete is in flight.
   */
  onCancel: () => void;
}

export default function DeleteWorkoutConfirmModal({
  isOpen,
  activityLabel,
  dateLabel,
  xpToReverse = 0,
  onConfirm,
  onCancel,
}: DeleteWorkoutConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDismiss = () => {
    if (isDeleting) return;
    onCancel();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-red-400 flex items-center justify-center">
              <Trash2 size={22} className="text-red-400" />
            </div>

            <h2
              className="text-xl font-black text-slate-900 dark:text-white mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              למחוק את האימון?
            </h2>
            <p
              className="text-sm text-slate-500 dark:text-slate-400 mb-7"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {xpToReverse > 0
                ? `${activityLabel} מ-${dateLabel} יימחק לצמיתות, וה-${xpToReverse} XP שצברת בזכותו יוחזרו בחזרה.`
                : `${activityLabel} מ-${dateLabel} יימחק לצמיתות. אי אפשר לשחזר אותו.`}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleDismiss}
                disabled={isDeleting}
                className="flex-1 h-14 rounded-2xl font-bold text-slate-600 dark:text-slate-300 text-base bg-slate-100 dark:bg-slate-700 active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                ביטול
              </button>

              <button
                onClick={handleConfirm}
                disabled={isDeleting}
                className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl font-bold text-white text-base bg-red-600 shadow-lg shadow-red-500/20 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:active:scale-100"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>מוחק...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    <span>מחק אימון</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
