'use client';

import React from 'react';
import { ArrowRight, Pencil } from 'lucide-react';

export interface DrawerHeaderProps {
  /**
   * Scroll-derived sticky-header opacity (0 → 1).  Driven by
   * `useScrollAnimation` in the orchestrator and applied both as a Tailwind
   * pointer-events gate AND as the inline opacity value so the header
   * fades in smoothly without intercepting taps when hidden.
   */
  headerOpacity: number;
  /** Resolved workout title (already prioritised by the orchestrator). */
  displayTitle: string;
  /** Close-button click handler — fires the same `onClose` the drawer uses. */
  onClose: () => void;
  /**
   * Edit pencil callback.  When omitted, a transparent spacer of the same
   * width keeps the title centred between the back button and the slot
   * where the pencil would have been.
   */
  onEditEntry?: () => void;
}

/**
 * Sticky scroll-collapsing header pinned to the top of the drawer.
 *
 * The header is invisible at scroll-top (`headerOpacity === 0`) and fades
 * in as the user scrolls past the hero — masking the hero image once it
 * has slid out of view.  Tap targets are gated by `pointer-events-none`
 * when invisible so the underlying hero close button remains clickable.
 *
 * `React.memo` is appropriate here because the orchestrator's `onClose`
 * and `onEditEntry` callbacks come straight from props (stable across
 * renders), and `headerOpacity` only changes when scroll progress
 * actually moves.
 */
const DrawerHeaderImpl: React.FC<DrawerHeaderProps> = ({
  headerOpacity,
  displayTitle,
  onClose,
  onEditEntry,
}) => {
  return (
    <div
      className={`absolute top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 transition-opacity duration-300 ${
        headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ opacity: headerOpacity }}
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
    </div>
  );
};

const DrawerHeader = React.memo(DrawerHeaderImpl);
DrawerHeader.displayName = 'DrawerHeader';

export default DrawerHeader;
