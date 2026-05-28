'use client';

import React from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight, Pencil } from 'lucide-react';

export interface DrawerHeaderProps {
  /**
   * Scroll-derived sticky-header opacity (MotionValue 0 → 1).
   * Driven by `useScrollAnimation` and consumed directly by a `motion.div`
   * so the fade-in runs on the compositor thread with no React re-renders.
   * Pointer-events are gated automatically via `useTransform`.
   */
  headerOpacity: MotionValue<number>;
  /** Resolved workout title (already prioritised by the orchestrator). */
  displayTitle: string;
  /** Close-button click handler — fires the same `onClose` the drawer uses. */
  onClose: () => void;
  /**
   * Edit pencil callback.  When omitted, a transparent spacer keeps the title
   * centred between the back button and the slot where the pencil would be.
   */
  onEditEntry?: () => void;
}

/**
 * Sticky scroll-collapsing header pinned to the top of the drawer.
 *
 * The header is invisible at scroll-top and fades in as the user scrolls past
 * the hero.  `pointer-events` is toggled via a `useTransform` so taps on the
 * underlying hero controls still register while the header is transparent.
 *
 * `React.memo` is appropriate here: the `onClose`/`onEditEntry` callbacks are
 * stable across renders, and `headerOpacity` is a MotionValue reference that
 * never changes identity — so the component re-renders only when props like
 * `displayTitle` genuinely change.
 */
const DrawerHeaderImpl: React.FC<DrawerHeaderProps> = ({
  headerOpacity,
  displayTitle,
  onClose,
  onEditEntry,
}) => {
  const pointerEvents = useTransform(
    headerOpacity,
    (v) => (v < 0.05 ? 'none' : 'auto') as 'none' | 'auto',
  );

  return (
    <motion.div
      className="absolute top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800"
      style={{ opacity: headerOpacity, pointerEvents }}
    >
      <div className="flex items-center justify-between px-4 pt-10 pb-3">
        <button
          onClick={onClose}
          className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-90 transition-transform"
          aria-label="סגור"
        >
          <ArrowRight size={20} />
        </button>
        <h1 className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center px-4 leading-tight line-clamp-2">
          {displayTitle}
        </h1>
        {onEditEntry ? (
          <button
            onClick={onEditEntry}
            className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-90 transition-transform"
            aria-label="ערוך אימון"
          >
            <Pencil size={18} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>
    </motion.div>
  );
};

const DrawerHeader = React.memo(DrawerHeaderImpl);
DrawerHeader.displayName = 'DrawerHeader';

export default DrawerHeader;
