'use client';

/**
 * ClassicFormSheet — the pre-v2 (flag-off) chrome that AddWorkoutModal and
 * PlannedActivityComposeSheet used to each copy inline: dim backdrop, panel
 * springing up inside it (max-w-md), gray grabber, 16px title + gray close.
 *
 * Byte-identical markup to those copies so `enable_home_v2` OFF renders
 * exactly as before: the two class strings that differed between them
 * (backdrop z / keyboard class, panel max-height / keyboard cap) are passed
 * in VERBATIM by each caller, never composed here. The v2 look is `<Sheet>`
 * (src/components/ui/v2/Sheet).
 * Retire this once the flag is removed.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface ClassicFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  /** The backdrop's full class string, verbatim from the original copy. */
  backdropClassName: string;
  /** The panel's full class string, verbatim from the original copy. */
  panelClassName: string;
  children?: ReactNode;
}

export default function ClassicFormSheet({
  isOpen,
  onClose,
  title,
  backdropClassName,
  panelClassName,
  children,
}: ClassicFormSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={backdropClassName}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className={panelClassName}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-black text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                aria-label="סגירה"
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
