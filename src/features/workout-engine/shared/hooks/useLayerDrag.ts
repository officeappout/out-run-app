'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDragControls } from 'framer-motion';

/**
 * useLayerDrag — Spotify-style draggable-layer state machine.
 *
 * Canonical hook for the BASE/TOP two-layer drag pattern shared across
 * all running modes (and eventually strength). Replaces usePlayerDragRunner
 * (free-run, 56 px) — StrengthRunner's usePlayerDrag (72 px) will migrate
 * here in a future checkpoint.
 *
 *   minimizedY = winH − dockH
 *   minimize:  offset.y > 100 || velocity.y > 500
 *   expand:    offset.y < −30 || velocity.y < −200
 *
 * @param dockH     Height of the collapsed mini-dock in px (56 for running, 72 for strength).
 * @param isActive  When false the layer resets to expanded (isMinimized=false).
 *                  Pass the session's isWorkoutActive flag so the layer
 *                  auto-collapses back on session end / exit.
 */

export interface LayerDragApi {
  dragControls: ReturnType<typeof useDragControls>;
  isMinimized: boolean;
  setIsMinimized: (v: boolean) => void;
  minimizedY: number;
  handleDragEnd: (
    _: unknown,
    info: { offset: { y: number }; velocity: { y: number } },
  ) => void;
}

export function useLayerDrag(dockH: number, isActive?: boolean): LayerDragApi {
  const [isMinimized, setIsMinimized] = useState(false);
  const [winH, setWinH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 812,
  );
  const dragControls = useDragControls();
  const minimizedY = winH - dockH;

  useEffect(() => {
    const update = () => {
      const h = window.innerHeight;
      console.log('[useLayerDrag] resize → winH:', h, 'minimizedY will be:', h - dockH);
      setWinH(h);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [dockH]);

  useEffect(() => {
    if (isActive === false) setIsMinimized(false);
  }, [isActive]);

  const handleDragEnd = useCallback(
    (
      _: unknown,
      info: { offset: { y: number }; velocity: { y: number } },
    ) => {
      const { offset, velocity } = info;
      console.log(
        '[useLayerDrag] dragEnd — isMinimized:', isMinimized,
        'offset.y:', offset.y.toFixed(1),
        'vel.y:', velocity.y.toFixed(1),
        'minimizedY:', minimizedY,
        'winH:', winH,
      );
      if (isMinimized) {
        // Threshold lowered from -50/-500 → -30/-200: a short upward flick
        // (~30 px or any noticeable velocity) is enough to expand.  The primary
        // fix is touch-action:none on the MINI strip (prevents the browser from
        // cancelling the gesture at ~30 px); this lower threshold is a safety net.
        if (offset.y < -30 || velocity.y < -200) {
          console.log('[useLayerDrag] → expand');
          setIsMinimized(false);
        }
      } else {
        if (offset.y > 100 || velocity.y > 500) {
          console.log('[useLayerDrag] → minimize');
          setIsMinimized(true);
        }
      }
    },
    [isMinimized, minimizedY, winH],
  );

  return { dragControls, isMinimized, setIsMinimized, minimizedY, handleDragEnd };
}
