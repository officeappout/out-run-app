'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface SummarySheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Stacked bottom-sheet chassis for summary deep-dives — laps / charts /
 * exercise history (design spec v0.9 §7: drawer-over-drawer, back + drag-down).
 *
 * Z-INDEX: lives in the z-[200] "post-workout summary" band (.cursorrules
 * z-index budget). When Stage 3 stacks multiple sheets on top of a summary,
 * register the additional stacked values in the .cursorrules table first.
 *
 * Ships inert — no mount site until the composition pages wire it.
 */
export default function SummarySheet({ open, title, onClose, children }: SummarySheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/40"
          />
          <motion.div
            dir="rtl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[200] max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
            style={{ fontFamily: 'var(--font-simpler)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-5 pb-2 pt-4">
              <span
                aria-hidden
                className="absolute left-0 right-0 top-2 mx-auto h-1.5 w-10 rounded-full bg-gray-300"
              />
              <span className="text-base font-bold text-gray-900">{title ?? ''}</span>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
