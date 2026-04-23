'use client';

/**
 * FilterSheet — reusable bottom sheet for the library filters.
 *
 * Built on Framer Motion (matches the WorkoutPreviewDrawer pattern).
 * Tap-outside or drag-down closes. Z-index sits at z-[70] (per the
 * project z-index budget — above the detail sheet).
 *
 * ⚠️ Rendered via React Portal into document.body to escape any
 * CSS containing block created by the sticky header's backdrop-filter
 * or position:sticky, which would otherwise trap fixed-positioned children.
 */

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface FilterSheetProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onClear?: () => void;
  onApply?: () => void;
  children: ReactNode;
  /** Footer slot — defaults to Clear / Apply buttons when callbacks are provided. */
  footer?: ReactNode;
}

export default function FilterSheet({
  isOpen,
  title,
  onClose,
  onClear,
  onApply,
  children,
  footer,
}: FilterSheetProps) {
  // Guard: only portal to document.body after client mount to avoid SSR mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — sits at viewport level, unaffected by parent stacking contexts */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[70]"
          />

          {/* Sheet — slides up from bottom: 0 of the viewport */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl shadow-drawer max-h-[80vh] flex flex-col"
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -me-2 text-gray-400 hover:text-gray-600 rounded-full"
                aria-label="סגור"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {/* Footer */}
            {footer ?? (
              (onClear || onApply) && (
                <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-white">
                  {onClear && (
                    <button
                      type="button"
                      onClick={onClear}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      נקה
                    </button>
                  )}
                  {onApply && (
                    <button
                      type="button"
                      onClick={onApply}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:opacity-90 transition-opacity"
                    >
                      החל
                    </button>
                  )}
                </div>
              )
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
