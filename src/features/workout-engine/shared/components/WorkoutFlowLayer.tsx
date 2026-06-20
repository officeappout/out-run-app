'use client';

/**
 * WorkoutFlowLayer — StrengthRunner-style notification-shade (Route A).
 *
 * Two-layer architecture, both anchored at `top: env(safe-area-inset-top, 0px)`.
 *
 *   BASE LAYER (z-49): revealContent (RunLapsList) — always rendered, fixed.
 *                      Completely hidden behind the TOP LAYER when closed.
 *
 *   TOP LAYER  (z-50): motion.div — `minHeight: 100dvh-safeArea` fills the
 *                      screen so its white background fully covers the BASE
 *                      LAYER at y=0. Dragging DOWN slides this cover away,
 *                      exposing the BASE LAYER below — exactly how StrengthRunner's
 *                      inset-0 TOP LAYER slides to minimizedY.
 *
 *   Open (y = revealH):
 *     • BASE LAYER fills the screen from safe-area-top to MiniDock top.
 *     • The story bar (children) is at MiniDock level — hidden behind
 *       MetricsDrawer (z-52).
 *
 *   Closed (y = 0):
 *     • TOP LAYER white bg covers BASE LAYER; story bar is at top of screen.
 *
 * maxRevealHeight limits RunLapsList to
 *   (100dvh - safe-area-top - 56px MiniDock - safe-area-bottom)
 * so revealH ≈ that value and opening pushes the story bar to MiniDock level.
 *
 * No backdrop needed — BASE LAYER covers the map when open; MetricsDrawer
 * at z-52 handles map-tap absorption via its own pointer-events.
 *
 * Drag mechanics (mirrors StrengthRunner/usePlayerDrag):
 *   dragListener=false + externalDragControls.start(e) on handle pointerDown.
 *   dragConstraints: { top: 0, bottom: revealH }.
 *   Spring: open 280/28 — close 320/32.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, useDragControls, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /**
   * Handle content (story bar) — in normal flow at the top of the TOP LAYER.
   * Visible at safe-area-top when the panel is closed.
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
      {/* BASE LAYER — RunLapsList: fixed at safe-area-top, always rendered.
          At y=0 the TOP LAYER covers it completely (white bg + minHeight).
          When TOP LAYER slides to y=revealH the BASE LAYER is fully exposed. */}
      <div
        className="absolute left-0 right-0 z-[49] pointer-events-none"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
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

      {/* TOP LAYER — story bar cover: slides DOWN to expose the BASE LAYER.
          `minHeight` ensures it covers the full viewport at y=0 so the white
          background completely hides RunLapsList (like StrengthRunner's
          inset-0 bg-black covers WorkoutPlaylist).
          dragListener=false → drag only starts from the handle's onPointerDown. */}
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
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))',
          background: 'white',
        }}
      >
        {/* Drag handle (story bar) — in normal flow at top of motion.div */}
        {children}

        {/* Fade strip — gradient below the story bar */}
        <div
          className="pointer-events-none"
          style={{
            height: 18,
            background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)',
          }}
          aria-hidden="true"
        />
      </motion.div>
    </>
  );
}
