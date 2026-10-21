'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { LOCATING_MANUAL_SEARCH_HINT_MS } from '../fast-locate';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

/**
 * LOCATING / diving — the white pill at the bottom while the Earth flies in.
 * Keeps the existing escape: after LOCATING_MANUAL_SEARCH_HINT_MS (4 s) of a
 * still-pending fix, "לוקח זמן? חיפוש ידני" (only while the fix is pending).
 */
export function DivePill({ onSearchManually }: { onSearchManually?: () => void }) {
  const t = useT(onboarding);
  const [showManual, setShowManual] = useState(false);
  useEffect(() => {
    if (!onSearchManually) {
      setShowManual(false);
      return;
    }
    const timer = setTimeout(() => setShowManual(true), LOCATING_MANUAL_SEARCH_HINT_MS);
    return () => clearTimeout(timer);
  }, [onSearchManually]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-6"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)' }}
      dir="rtl"
      role="status"
    >
      <AnimatePresence>
        {showManual && onSearchManually && (
          <motion.button
            type="button"
            onClick={onSearchManually}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-extrabold text-v2-deep shadow-v2-float whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2"
          >
            <Search size={16} aria-hidden />
            {t('location.entry.dive.manual')}
          </motion.button>
        )}
      </AnimatePresence>
      <span className="flex h-10 w-full max-w-[280px] items-center justify-center gap-2 rounded-full bg-white/95 px-[18px] text-[14px] font-bold text-v2-ink shadow-v2-float whitespace-nowrap">
        <motion.span
          className="h-2 w-2 flex-shrink-0 rounded-full bg-v2-accent"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {t('location.entry.dive.pill')}
      </span>
    </motion.div>
  );
}
