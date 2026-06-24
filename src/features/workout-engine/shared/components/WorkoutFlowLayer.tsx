'use client';

/**
 * WorkoutFlowLayer — StrengthRunner-style notification-shade (Route A).
 *
 * Two-layer architecture, both anchored at `top: env(safe-area-inset-top, 0px)`.
 * Mirrors StrengthRunner's inset-0 two-layer model 1:1, with one key swap:
 *   StrengthRunner TOP LAYER  bg-black  → FreeRunActive TOP LAYER  transparent
 *   StrengthRunner BASE LAYER bg-white  → RunLapsList  bg-white
 *
 * The map tiles ARE the equivalent of bg-black: they provide the opaque
 * "covered" state — the map renders below FreeRunActive (z-40) and is
 * always visible through the transparent TOP LAYER when laps are closed.
 *
 *   BASE LAYER (z-49): revealContent (RunLapsList) — always mounted for
 *                      ResizeObserver measurement; opacity:0 when closed so
 *                      the map shows through instead of white.
 *
 *   TOP LAYER  (z-50): motion.div — transparent (no bg/minHeight).  At y=0
 *                      the map shows through. Slides DOWN to y=revealH,
 *                      exposing the BASE LAYER (RunLapsList) above it.
 *                      MetricsDrawer (z-52) stays above this layer and acts
 *                      as the MiniPlayerBar equivalent (MiniDock at bottom).
 *
 *   Open (y = revealH):
 *     • RunLapsList fills the screen from safe-area to MiniDock top.
 *     • The story bar is at MiniDock level — hidden behind MetricsDrawer (z-52).
 *
 *   Closed (y = 0):
 *     • TOP LAYER transparent → map visible.  BASE LAYER opacity:0 → invisible.
 *     • Zero white.
 *
 * minimizedY = winH − 56 (MiniDock height)  ←  same formula as StrengthRunner
 * maxRevealHeight = 100dvh − safeAreaTop − 56px MiniDock − safeAreaBottom
 *
 * Drag mechanics (mirrors StrengthRunner/usePlayerDrag exactly):
 *   dragListener=false + externalDragControls.start(e) on handle pointerDown.
 *   dragConstraints: { top: 0, bottom: revealH }.
 *   Spring: open 280/28 — close 320/32.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, useDragControls, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /**
   * Handle content (story bar) — in normal flow at the top of the TOP LAYER.
   * Visible at safe-area-top when the panel is closed (story bar floats on map).
   * Its onPointerDown should call `externalDragControls.start(e)`.
   * Do NOT add safe-area-inset-top padding — the motion.div anchors there.
   */
  children: React.ReactNode;
  /** Content to reveal (RunLapsList) — rendered in the BASE LAYER. */
  revealContent: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  /** Created in the parent via `useDragControls()`. */
  externalDragControls: ReturnType<typeof useDragControls>;
  /** Fires when BASE LAYER content height changes (map camera padding). */
  onRevealHeightChange?: (h: number) => void;
  /**
   * CSS max-height for the RunLapsList scrollable container.
   * Default fills from safe-area-top to just above the 56 px MiniDock.
   */
  maxRevealHeight?: string;
}

export default function WorkoutFlowLayer({
  children,
  revealContent,
  isOpen,
  onClose,
  onOpen,
  externalDragControls,
  onRevealHeightChange,
  maxRevealHeight = 'calc(100dvh - env(safe-area-inset-top, 0px) - 56px - env(safe-area-inset-bottom, 0px))',
}: WorkoutFlowLayerProps) {
  const controls = useAnimation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [revealH, setRevealH] = useState(0);

  // BASE LAYER always mounted — keep ResizeObserver working. Hide visually
  // when closed so the map shows through (opacity:0 = no white, no block).
  // Short transition avoids a hard flash when the panel snaps open/closed.
  const baseStyle: React.CSSProperties = {
    top: 'env(safe-area-inset-top, 0px)',
    opacity: isOpen ? 1 : 0,
    transition: 'opacity 0.15s ease',
    pointerEvents: isOpen ? undefined : 'none',
  };

  // Measure BASE LAYER height for drag constraints and spring target.
  useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => {
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (Number.isFinite(h) && h > 0) {
        setRevealH(Math.round(h));
        onRevealHeightChange?.(Math.round(h));
      }
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [onRevealHeightChange]);

  // Spring-animate TOP LAYER on open/close state change.
  useEffect(() => {
    controls.start({
      y: isOpen ? revealH : 0,
      transition: {
        type: 'spring',
        stiffness: isOpen ? 280 : 320,
        damping: isOpen ? 28 : 32,
      },
    });
  }, [isOpen, revealH, controls]);

  // Snap on drag release — same thresholds as StrengthRunner.
  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (isOpen) {
        if (info.offset.y < -50 || info.velocity.y < -400) {
          onClose();
        } else {
          controls.start({ y: revealH, transition: { type: 'spring', stiffness: 280, damping: 28 } });
        }
      } else {
        if (info.offset.y > 30 || info.velocity.y > 300) {
          onOpen?.();
        } else {
          controls.start({ y: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } });
        }
      }
    },
    [isOpen, revealH, controls, onClose, onOpen],
  );

  return (
    <>
      {/* BASE LAYER — RunLapsList: always mounted (ResizeObserver needs it).
          opacity:0 when closed → map visible through transparent TOP LAYER.
          opacity:1 when open  → white laps surface fills safe-area to MiniDock. */}
      <div
        className="absolute left-0 right-0 z-[49] pointer-events-none"
        style={baseStyle}
      >
        <div
          ref={contentRef}
          className="bg-white overflow-hidden pointer-events-auto"
          style={{ boxShadow: isOpen ? '0 4px 24px rgba(0,0,0,0.12)' : 'none' }}
        >
          <div style={{ maxHeight: maxRevealHeight, overflowY: 'auto' }}>
            {revealContent}
          </div>
        </div>
      </div>

      {/* TOP LAYER — transparent motion.div: the map IS the background.
          Slides DOWN to y=revealH to reveal the BASE LAYER (RunLapsList).
          No minHeight/background — the map tiles show through at y=0,
          exactly as StrengthRunner's bg-black covers the playlist at y=0. */}
      <motion.div
        drag="y"
        dragControls={externalDragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: revealH }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={{ y: 0 }}
        className="absolute left-0 right-0 z-50 pointer-events-none"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Drag handle (story bar) — in normal flow, floats over the map */}
        {children}
      </motion.div>
    </>
  );
}
