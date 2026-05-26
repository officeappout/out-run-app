'use client';

import React from 'react';
import { Dumbbell, ChevronUp, Pause, Play } from 'lucide-react';
import { useDragControls } from 'framer-motion';

/**
 * MiniPlayerBar — Spotify-style collapsed mini-player.
 *
 * Rendered as the top draggable layer when `isMinimized` is true.  Shows:
 *   • A square media thumbnail (video preview if available, else dumbbell icon)
 *   • The active exercise name + elapsed time (RTL Hebrew-first layout)
 *   • A pause / play toggle button (stops propagation so it never expands)
 *   • A chevron-up affordance hinting "tap to expand"
 *
 * Tap anywhere outside the pause button → expand (via `onExpand`).
 * Drag anywhere outside the pause button → starts the framer-motion gesture.
 *
 * Pure presentational — no state, no refs.  All wiring is piped via props
 * from the parent orchestrator.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-6).
 */

export interface MiniPlayerBarProps {
  /** Name of the currently active exercise (RTL display). */
  exerciseName: string;
  /** Pre-formatted elapsed-time label (e.g. "12:34"). */
  elapsedTimeLabel: string;
  /** Resolved video URL of the active exercise — null falls back to the dumbbell icon. */
  safeVideoUrl: string | null;
  /** Whether the workout is currently paused — flips the icon between Play / Pause. */
  isPaused: boolean;
  /** Framer-motion drag controls bound to the parent's `<motion.div drag="y" />`. */
  dragControls: ReturnType<typeof useDragControls>;
  /** Tap anywhere (outside the pause button) → expand back to full-screen mode. */
  onExpand: () => void;
  /** Pause button → toggles workout pause state (event propagation is handled inside). */
  onTogglePause: () => void;
}

export default function MiniPlayerBar({
  exerciseName,
  elapsedTimeLabel,
  safeVideoUrl,
  isPaused,
  dragControls,
  onExpand,
  onTogglePause,
}: MiniPlayerBarProps) {
  return (
    <div
      className="flex items-center h-[72px] px-4 gap-3 cursor-pointer"
      onClick={onExpand}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        dragControls.start(e);
      }}
      style={{ touchAction: 'none' }}
    >
      <div className="w-11 h-11 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
        {safeVideoUrl ? (
          <video src={safeVideoUrl} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Dumbbell size={18} className="text-slate-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0" dir="rtl">
        <p className="text-white font-bold text-sm truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
          {exerciseName}
        </p>
        <p className="text-white/50 text-xs tabular-nums" style={{ fontFamily: 'var(--font-simpler)' }}>
          {elapsedTimeLabel}
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onTogglePause(); }}
        className="w-10 h-10 flex items-center justify-center"
      >
        {isPaused ? (
          <Play size={20} className="text-white" fill="white" />
        ) : (
          <Pause size={20} className="text-white" />
        )}
      </button>

      <ChevronUp size={18} className="text-white/40" />
    </div>
  );
}
