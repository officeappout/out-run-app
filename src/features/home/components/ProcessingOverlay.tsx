'use client';

/**
 * ProcessingOverlay - 2-second full-screen animation shown when saving
 * an adjusted workout from the AdjustWorkoutModal.
 *
 * Visual: Dark background → pulsing concentric rings → progress bar → fade out.
 * Duration: exactly 2 000 ms.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProcessingOverlayProps {
  /** Controls visibility */
  isVisible: boolean;
  /** Called after the 2-second animation completes */
  onComplete: () => void;
}

export default function ProcessingOverlay({ isVisible, onComplete }: ProcessingOverlayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      return;
    }

    // Animate progress 0 → 80 over 1 600 ms, then hold for fade-out
    const start = Date.now();
    const duration = 1600;
    let frame: number;

    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 80, 80);
      setProgress(pct);
      if (elapsed < duration) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    // After 2 000 ms total → trigger complete
    const timeout = setTimeout(() => {
      setProgress(100);
      onComplete();
    }, 2000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="processing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0F172A]/95 backdrop-blur-md"
        >
          {/* Pulsing Concentric Rings */}
          <motion.div
            animate={{ scale: [0.95, 1.05, 0.95] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="relative w-32 h-32 mb-8"
          >
            {/* Outer ring */}
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full border-2 border-cyan-400/40"
            />
            {/* Middle ring */}
            <motion.div
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', delay: 0.15 }}
              className="absolute inset-3 rounded-full border-2 border-cyan-400/60"
            />
            {/* Inner ring */}
            <motion.div
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', delay: 0.3 }}
              className="absolute inset-6 rounded-full border-2 border-cyan-400"
            />
            {/* Center dot */}
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="absolute inset-0 m-auto w-4 h-4 rounded-full bg-cyan-400"
            />
          </motion.div>

          {/* Pulsing Message */}
          <motion.p
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="text-cyan-400 text-base font-medium mb-6"
          >
            מעדכן אימון...
          </motion.p>

          {/* Progress Bar */}
          <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
