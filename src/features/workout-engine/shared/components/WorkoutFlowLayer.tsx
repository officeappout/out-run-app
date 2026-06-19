'use client';

/**
 * WorkoutFlowLayer — notification-shade reveal layer.
 *
 * Single motion.div anchored below the safe-area.  At y=0 the revealContent
 * is clipped above the viewport; the handle (story bar) sits at the top of
 * the visible area.  Dragging DOWN slides the motion.div so revealContent
 * comes into view — exactly like an Android notification shade.
 *
 *   ┌──────────────────────────────────────┐ ← screen top (y=0)
 *   │  status bar (safe-area-inset-top)    │
 *   ├──────────────────────────────────────┤ ← motion.div layout top (top: safe-area)
 *   │ [revealContent — abs, bottom:100%,   │
 *   │  hidden above this line when y=0]    │
 *   │ ────────────────────────────────     │
 *   │   story bar / handle (children)      │
 *   └──────────────────────────────────────┘
 *
 *   Open (y = revealH):
 *   ├──────────────────────────────────────┤ ← revealContent.top (y = safe-area)
 *   │   RunLapsList (visible)              │
 *   ├──────────────────────────────────────┤ ← story bar starts here (y = safe-area+revealH)
 *   │   story bar / handle                 │
 *   └──────────────────────────────────────┘
 *
 * The FreeRunActive outer div has `overflow-hidden` which clips revealContent
 * above y=0, making it invisible in the closed state.
 *
 * Drag mechanics (mirrors StrengthRunner exactly):
 *   dragListener=false + externalDragControls.start(e) on handle pointerDown.
 *   dragConstraints: { top: 0, bottom: revealH }.
 *   Spring: open 280/28 — close 320/32.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, useDragControls, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /**
   * Handle content (story bar) rendered in the normal flow of the motion.div.
   * Visible at the top of the screen when the panel is closed.
   * Its onPointerDown should call `externalDragControls.start(e)`.
   * Do NOT add safe-area-inset-top padding here — the motion.div handles it.
   */
  children: React.ReactNode;
  /** Content to reveal (RunLapsList) — positioned absolutely above the handle. */
  revealContent: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  /** Created in the parent via `useDragControls()`. */
  externalDragControls: ReturnType<typeof useDragControls>;
  /** Notifies parent when reveal content height changes (for map camera padding). */
  onRevealHeightChange?: (h: number) => void;
  /** CSS max-height for the scrollable reveal container. */
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
  maxRevealHeight = 'calc(60dvh - env(safe-area-inset-top, 0px))',
}: WorkoutFlowLayerProps) {
  const controls = useAnimation();
  const revealRef = useRef<HTMLDivElement | null>(null);
  const [revealH, setRevealH] = useState(0);

  // Measure reveal content height for drag constraints and spring target.
  useEffect(() => {
    const node = revealRef.current;
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

  // Spring-animate on open/close state change.
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
      {/* Backdrop — absorbs map taps while open */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[48] pointer-events-auto"
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/*
        Single draggable motion.div.

        `top: env(safe-area-inset-top, 0px)` anchors it just below the status bar.
        The handle (children) lives in normal flow at the top of this div — always
        visible in the closed state.

        revealContent is absolutely positioned with `bottom: 100%` so its bottom
        edge aligns with the motion.div's top.  In the closed state (y=0) it sits
        above the viewport and is clipped by FreeRunActive's `overflow-hidden`.
        When the motion.div slides to y=revealH the revealContent comes into view.
      */}
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
        {/* Reveal content — above the handle, clipped when closed */}
        <div
          ref={revealRef}
          className="absolute left-0 right-0 bg-white pointer-events-auto"
          style={{
            bottom: '100%',
            maxHeight: maxRevealHeight,
            overflowY: 'auto',
            boxShadow: isOpen ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          {revealContent}
        </div>

        {/* Handle (story bar) — in-flow, always at top of motion.div */}
        {children}

        {/* Fade strip */}
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
