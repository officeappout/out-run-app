'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight } from 'lucide-react';

/**
 * LevelUpModal — celebration overlay shown when the active program levels up.
 *
 * Staggered entry animation:
 *   1. Backdrop fades in
 *   2. Card springs up (scale + y)
 *   3. Trophy icon scales in (delay 0.2s)
 *   4. Title + program name + level fade-up (delays 0.3 / 0.4 / 0.5)
 *   5. CTA button fades in (delay 0.6s)
 *
 * Scrim click + CTA both fire `onClose`.
 */

export interface LevelUpModalProps {
  isOpen: boolean;
  /** Program name shown above the new level number. */
  programName: string;
  /** New level number — when `null` the modal is suppressed even if `isOpen`. */
  newLevel: number | null | undefined;
  onClose: () => void;
}

export default function LevelUpModal({
  isOpen,
  programName,
  newLevel,
  onClose,
}: LevelUpModalProps) {
  return (
    <AnimatePresence>
      {isOpen && newLevel != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.7, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-xs shadow-2xl text-center"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2, damping: 12 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"
            >
              <Trophy className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-black text-slate-900 dark:text-white mb-1"
            >
              עלית רמה!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg font-bold text-cyan-600 dark:text-cyan-400 mb-1"
            >
              {programName}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-4xl font-black text-slate-900 dark:text-white mb-6"
            >
              רמה {newLevel}
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              onClick={onClose}
              className="w-full py-3.5 rounded-xl bg-gradient-to-l from-[#00C9F2] to-[#00E5FF] text-white font-bold text-base shadow-lg shadow-cyan-500/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
            >
              <span>המשך לרמה הבאה</span>
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
