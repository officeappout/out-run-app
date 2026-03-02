'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { KudoDoc } from '../services/kudos.service';

interface KudoToastProps {
  kudo: KudoDoc | null;
  onDismiss: () => void;
}

/**
 * KudoToast — slides in from the top during an active workout
 * when someone sends a High Five.  Auto-dismisses after 3s (handled by hook).
 */
export default function KudoToast({ kudo, onDismiss }: KudoToastProps) {
  return (
    <AnimatePresence>
      {kudo && (
        <motion.div
          key={kudo.id}
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 z-[200] pointer-events-auto"
          style={{ transform: 'translateX(-50%)' }}
        >
          <button
            onClick={onDismiss}
            className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border border-cyan-200 backdrop-blur-md"
            style={{ background: 'linear-gradient(135deg, #E0F7FF 0%, #F0FBFF 100%)' }}
            dir="rtl"
          >
            <span className="text-2xl" role="img" aria-label="high five">🙏</span>
            <div className="flex flex-col items-start">
              <span className="text-[13px] font-bold text-gray-900">
                {kudo.fromName} שלח/ה לך High Five!
              </span>
              <span className="text-[11px] text-cyan-600 font-semibold">
                המשך/י לגרוס את זה 💪
              </span>
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
