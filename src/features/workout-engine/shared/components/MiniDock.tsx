'use client';

import React from 'react';
import { ChevronUp } from 'lucide-react';
import type { useDragControls } from 'framer-motion';

/**
 * MiniDock — 56 px collapsed pill at the bottom of the screen.
 *
 * A content-slot refactor of MiniPlayerBar (strength). Provides the dark
 * rounded pill surface + chevron affordance; the caller supplies whatever
 * metric content belongs to the current workout mode.
 *
 * Free-run uses: distance + time + optional goal pill.
 * Strength (future): exercise name + timer + video thumb.
 */

export interface MiniDockProps {
  /** Metric content to render inside the pill. */
  children: React.ReactNode;
  /** Tap anywhere → expand to peek/full. */
  onExpand?: () => void;
  /** Framer-motion drag controls from the parent MetricsDrawer. */
  dragControls?: ReturnType<typeof useDragControls>;
}

export default function MiniDock({ children, onExpand, dragControls }: MiniDockProps) {
  return (
    <div
      className="flex items-center h-[56px] px-4 gap-2 cursor-pointer"
      style={{ touchAction: 'none' }}
      onClick={onExpand}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        dragControls?.start(e);
      }}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <ChevronUp size={18} className="text-white/40 flex-shrink-0" />
    </div>
  );
}
