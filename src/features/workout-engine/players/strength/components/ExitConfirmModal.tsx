'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square } from 'lucide-react';
import { hapticWarning } from '@/lib/haptics';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

import { useUiDir } from '@/lib/i18n/useUiDir';
/**
 * ExitConfirmModal — early-exit confirmation dialog.
 *
 * Renders a centered card at z-90 (below the PauseOverlay's z-100) with:
 *   • An orange square stop icon
 *   • Bilingual confirmation heading + supportive subtext
 *   • A primary "יאללה להמשיך" cyan CTA that dismisses (and unpauses)
 *   • A secondary underlined link "אני רוצה לסיים את האימון באמצע" that exits
 *   • Backdrop tap also dismisses
 *
 * Self-contained — owns its own AnimatePresence and visibility via `isOpen`.
 * Both backdrop tap and the "continue" CTA share `onDismiss`.
 *
 * S1 (pilot wave 2): optional "יציאה בלי שמירה" link (`onDiscard`). Two taps: the first
 * swaps the copy to what will NOT happen (no history, XP or weekly volume), the second
 * confirms. Omitted (hybrid station) → the modal is exactly as before.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-7).
 */

export interface ExitConfirmModalProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Dismiss action — closes the modal (orchestrator may also unpause). */
  onDismiss: () => void;
  /** Absolute early-exit trigger — fires the workout-complete callback. */
  onExit: () => void;
  /** Leave without saving anything. Omitted → no discard link. */
  onDiscard?: () => void;
}

export default function ExitConfirmModal({ isOpen, onDismiss, onExit, onDiscard }: ExitConfirmModalProps) {
  const { direction } = useUiDir();
  const t = useT(player);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!isOpen) setConfirmDiscard(false);
  }, [isOpen]);
  const handleDiscard = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    hapticWarning();
    onDiscard?.();
  };
  const handleExit = () => {
    hapticWarning();
    onExit();
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
            dir={direction}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
              <Square size={22} className="text-orange-400" fill="currentColor" />
            </div>

            <h2
              className="text-xl font-black text-slate-900 dark:text-white mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {t('strengthPlayer.exit.title')}
            </h2>
            <p
              className="text-sm text-slate-500 dark:text-slate-400 mb-7"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {t(confirmDiscard ? 'strengthPlayer.exit.discardText' : 'strengthPlayer.exit.text')}
            </p>

            <button
              onClick={onDismiss}
              className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {t('strengthPlayer.exit.continue')}
            </button>

            <button
              onClick={handleExit}
              className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {t('strengthPlayer.exit.end')}
            </button>

            {onDiscard && (
              <button
                onClick={handleDiscard}
                className={confirmDiscard
                  ? 'block w-full mt-5 h-12 rounded-2xl font-bold text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/40 active:scale-[0.98] transition-transform'
                  : 'block mx-auto mt-4 text-sm text-slate-400 dark:text-slate-500 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors'}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {t(confirmDiscard ? 'strengthPlayer.exit.discardConfirm' : 'strengthPlayer.exit.discard')}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
