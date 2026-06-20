'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDragControls } from 'framer-motion';

/**
 * usePlayerDragRunner — Spotify-style draggable layer for FreeRunLayer.
 *
 * Free-run variant of usePlayerDrag (StrengthRunner). Key difference:
 *   MINI_DOCK_H = 56 px  (MiniDock)  vs. 72 px (MiniPlayerBar in strength).
 *
 * Same snap thresholds as StrengthRunner:
 *   minimize:  offset.y > 100 || velocity.y > 500
 *   expand:    offset.y < -50 || velocity.y < -500
 *
 * Resets isMinimized to false when isWorkoutActive becomes false
 * (session ends / user exits) so the next session starts expanded.
 */

const MINI_DOCK_H = 56;

export interface PlayerDragRunnerApi {
  dragControls: ReturnType<typeof useDragControls>;
  isMinimized: boolean;
  setIsMinimized: (v: boolean) => void;
  minimizedY: number;
  handleDragEnd: (
    _: unknown,
    info: { offset: { y: number }; velocity: { y: number } },
  ) => void;
}

export function usePlayerDragRunner(isWorkoutActive: boolean): PlayerDragRunnerApi {
  const [isMinimized, setIsMinimized] = useState(false);
  const [winH, setWinH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 812,
  );
  const dragControls = useDragControls();
  const minimizedY = winH - MINI_DOCK_H;

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isWorkoutActive) setIsMinimized(false);
  }, [isWorkoutActive]);

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

  return { dragControls, isMinimized, setIsMinimized, minimizedY, handleDragEnd };
}
