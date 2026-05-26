'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useDragControls } from 'framer-motion';

/**
 * usePlayerDrag — Spotify-style draggable mini-player UX for the live workout shell.
 *
 * Owns the entire interaction matrix for the top draggable layer:
 *   • `isMinimized` — collapsed mini-player vs full-screen mode
 *   • `winH` / `minimizedY` — current viewport height & snap-to-bottom Y offset
 *   • `dragControls` — framer-motion gesture controller bound to the draggable shell
 *   • `handleDragEnd` — offset/velocity threshold logic for snap (down ↓ minimize / up ↑ expand)
 *   • `handleHeaderPointerDown` — header-as-drag-handle starter (ignores button targets)
 *
 * Pure UX hook — no coupling to the workout state machine.  Consumers that need
 * to force-expand on specific lifecycle events (e.g. PREPARING) call
 * `setIsMinimized(false)` from their own effect.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-2).
 */

const MINI_PLAYER_H = 72;

export interface PlayerDragApi {
  dragControls: ReturnType<typeof useDragControls>;
  isMinimized: boolean;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  minimizedY: number;
  handleDragEnd: (
    _: unknown,
    info: { offset: { y: number }; velocity: { y: number } },
  ) => void;
  handleHeaderPointerDown: (e: React.PointerEvent) => void;
}

export function usePlayerDrag(): PlayerDragApi {
  const [isMinimized, setIsMinimized] = useState(false);
  const [winH, setWinH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 812,
  );
  const dragControls = useDragControls();

  const minimizedY = winH - MINI_PLAYER_H;

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleDragEnd = useCallback(
    (
      _: unknown,
      info: { offset: { y: number }; velocity: { y: number } },
    ) => {
      const { offset, velocity } = info;
      if (isMinimized) {
        if (offset.y < -50 || velocity.y < -500) setIsMinimized(false);
      } else {
        if (offset.y > 100 || velocity.y > 500) setIsMinimized(true);
      }
    },
    [isMinimized],
  );

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragControls.start(e);
    },
    [dragControls],
  );

  return {
    dragControls,
    isMinimized,
    setIsMinimized,
    minimizedY,
    handleDragEnd,
    handleHeaderPointerDown,
  };
}

export { MINI_PLAYER_H };
