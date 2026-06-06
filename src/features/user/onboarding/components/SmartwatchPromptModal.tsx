'use client';

/**
 * SmartwatchPromptModal — pre-run progression nudge
 * -------------------------------------------------
 * Shown in place of the equipment JIT prompt when the user is about to
 * start a RUN (free run or guided route).
 *
 * Bluetooth smartwatch pairing isn't shipped yet, so this modal no longer
 * advertises a (non-functional) "connect" action or a "coming soon" toast.
 * It now reads as a short, positive progression message with a SINGLE CTA
 * that resolves `onClose` — which `useSmartwatchPrompt` trampolines into the
 * deferred workout-start callback. The workout always proceeds.
 *
 * Visual language matches `JITSetupModal`:
 *   • z-[90], blur backdrop, centred white card.
 *   • Cyan-bordered icon ring at the top with a Watch glyph.
 *   • Brand-cyan gradient primary button.
 *
 * NOTE: Mounted globally by MapShell. Only ONE instance lives in the
 * tree; render is a no-op when `isOpen === false`.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Watch } from 'lucide-react';

interface SmartwatchPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmartwatchPromptModal({
  isOpen,
  onClose,
}: SmartwatchPromptModalProps) {
  if (!isOpen) return null;

  // Bluetooth pairing isn't shipped yet, so the modal no longer exposes a
  // (non-functional) "connect" stub or a "coming soon" toast. It now reads as
  // a short progression nudge with a single CTA that resolves the deferred
  // workout-start callback (`onClose`) — the workout always proceeds.
  const handleStart = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // z-[90] matches JITSetupModal so the two never collide visually
        // (they cannot be open at the same time anyway — JIT resolves
        // BEFORE this prompt is opened, by useWorkoutSession's chaining).
        className="fixed inset-0 z-[90] flex items-center justify-center p-6"
        style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon ring — cyan border, watch glyph. Matches the JIT
              modal's top-of-card visual rhythm so the two prompts feel
              like cousins. */}
          <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-cyan-400 flex items-center justify-center">
            <Watch className="w-6 h-6 text-cyan-500" />
          </div>

          <h2
            className="text-xl font-black text-slate-900 mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מוכנים להתקדם?
          </h2>
          <p
            className="text-sm text-slate-500 mb-6"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            כל אימון מקרב אותך צעד נוסף אל היעד שלך. בוא נתחיל ונמשיך לבנות
            את הרצף.
          </p>

          {/* Single positive CTA — proceeds straight into the workout. */}
          <button
            onClick={handleStart}
            className="w-full h-14 rounded-2xl font-bold text-white text-base bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            קדימה, מתחילים 💪
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SmartwatchPromptModal;
