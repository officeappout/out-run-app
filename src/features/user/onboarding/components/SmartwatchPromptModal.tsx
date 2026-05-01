'use client';

/**
 * SmartwatchPromptModal — pre-run smartwatch teaser
 * -------------------------------------------------
 * Replacement for the equipment JIT prompt when the user is about to
 * start a RUN (free run or guided route). Asks "אימון עם שעון חכם?"
 * with two paths:
 *
 *   • "חיבור שעון" → triggers a "coming soon" toast (Bluetooth pairing
 *                    isn't shipped yet). The workout proceeds anyway —
 *                    we never block the run on a feature we can't yet
 *                    deliver.
 *   • "דילוג"     → workout proceeds without any side-effect.
 *
 * Both paths resolve to the SAME `onClose` so `useSmartwatchPrompt` can
 * trampoline the deferred workout-start callback regardless of which
 * button was tapped.
 *
 * Visual language matches `JITSetupModal`:
 *   • z-[90], blur backdrop, centred white card.
 *   • Cyan-bordered icon ring at the top with a Watch glyph.
 *   • Brand-cyan gradient primary button.
 *   • Plain-text secondary ("דלג בינתיים" pattern).
 *
 * NOTE: Mounted globally by MapShell. Only ONE instance lives in the
 * tree; render is a no-op when `isOpen === false`.
 */

import React, { useState } from 'react';
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
  const [showComingSoon, setShowComingSoon] = useState(false);

  if (!isOpen) return null;

  /**
   * "Connect" path: surface a 1.5 s "coming soon" toast (inline, since
   * we don't want to introduce a global toast singleton for one teaser),
   * then resolve as if the user skipped — the workout MUST proceed.
   * If we ever ship Bluetooth pairing, this is the only branch that
   * needs to change.
   */
  const handleConnect = () => {
    setShowComingSoon(true);
    setTimeout(() => {
      setShowComingSoon(false);
      onClose();
    }, 1500);
  };

  const handleSkip = () => {
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
            אימון עם שעון חכם?
          </h2>
          <p
            className="text-sm text-slate-500 mb-6"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            חבר שעון Garmin, Apple Watch או Fitbit למעקב מדויק יותר אחר
            הדופק והקצב.
          </p>

          {/* Inline "coming soon" toast — replaces the connect CTA when
              the user taps it, then auto-dismisses. We intentionally
              don't build a global toast for this; the modal context is
              the only place this surface fires. */}
          {showComingSoon ? (
            <div
              className="w-full h-14 rounded-2xl flex items-center justify-center mb-4 bg-slate-100 text-slate-700 font-bold"
              style={{ fontFamily: 'var(--font-simpler)' }}
              role="status"
              aria-live="polite"
            >
              ⌚ חיבור שעון בקרוב — מתחילים את האימון
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              חיבור שעון
            </button>
          )}

          {/* Skip — plain text. Disabled while the toast is up so the
              user doesn't accidentally double-trigger. */}
          <button
            onClick={handleSkip}
            disabled={showComingSoon}
            className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors disabled:opacity-40"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            דילוג
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SmartwatchPromptModal;
