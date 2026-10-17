'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search } from 'lucide-react';
import { LOCATING_MANUAL_SEARCH_HINT_MS } from '../fast-locate';

export function LocatingCard({
  v2 = false,
  onSearchManually,
}: { v2?: boolean; onSearchManually?: () => void } = {}) {
  // v2: if the fix is slow (cold GPS, weak signal), offer the manual search
  // after a few seconds instead of leaving the user on a spinner.
  const [showManualHint, setShowManualHint] = useState(false);
  useEffect(() => {
    if (!v2 || !onSearchManually) return;
    const t = setTimeout(() => setShowManualHint(true), LOCATING_MANUAL_SEARCH_HINT_MS);
    return () => clearTimeout(t);
  }, [v2, onSearchManually]);

  if (v2) {
    // v2 — bottom sheet over the full-bleed map; owns the bottom inset once.
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="absolute bottom-0 left-0 right-0 z-20"
        dir="rtl"
      >
        <div
          className="rounded-t-[28px] bg-white shadow-v2-sheet px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-v2-pill-border" />
          <div className="flex flex-col items-center justify-center py-10">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-v2-tint mb-4">
              <Loader2 size={28} className="text-v2-accent animate-spin" />
            </div>
            <p className="text-[16px] font-extrabold text-v2-ink whitespace-nowrap">
              מאתרים את המיקום שלך...
            </p>
            {/* Fixed-height slot so the sheet doesn't jump when the link appears */}
            <div className="mt-4 h-11">
              <AnimatePresence>
                {showManualHint && onSearchManually && (
                  <motion.button
                    type="button"
                    onClick={onSearchManually}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-extrabold text-v2-deep shadow-v2-ring whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2"
                  >
                    <Search size={16} />
                    לוקח זמן? חיפוש ידני
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-8 border-t border-slate-100/40">
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 size={40} className="text-[#5BC2F2] animate-spin mb-4" />
            <p 
              className="text-slate-700 font-medium text-lg"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מאתרים את המיקום שלך...
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
