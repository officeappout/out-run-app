'use client';

/**
 * WorkoutFlowLayer — notification-shade reveal layer.
 *
 * Exact replica of StrengthRunner's two-layer drag architecture:
 *
 *   BASE LAYER (z-[49])  — revealContent: fixed at screen top, always rendered.
 *                          Covered by the TOP LAYER when closed.
 *   TOP LAYER  (z-50)    — children (handle/story-bar): draggable motion.div.
 *                          At y=0  → covers the BASE LAYER (closed).
 *                          At y=revealContentH → slid DOWN, BASE LAYER fully exposed.
 *   BACKDROP   (z-[48])  — absorbs map taps while open.
 *
 * Drag mechanics (mirrors StrengthRunner / FreeRunActive exactly):
 *   motion.div  drag="y", dragListener=false, dragMomentum=false.
 *   Handle div: onPointerDown → externalDragControls.start(e).
 *   dragConstraints: { top: 0, bottom: revealContentH }.
 *   onDragEnd: offset>30 or velocity>300 → open; offset<-50 or velocity<-400 → close.
 *   Spring: open stiffness 280 / damping 28 — close stiffness 320 / damping 32.
 *
 * The safe-area-inset-top padding lives on the revealContent container (not a
 * wrapper above it), so ResizeObserver captures the FULL block height
 * (safe-area + content).  The TOP LAYER therefore slides the exact right amount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, useDragControls, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /**
   * Handle content rendered inside the TOP LAYER motion.div (e.g. story bar).
   * The parent's drag handle div — which calls `externalDragControls.start(e)`
   * on `onPointerDown` — should live here.
   */
  children: React.ReactNode;
  /** Content to reveal in the BASE LAYER (e.g. RunLapsList). */
  revealContent: React.ReactNode;
  /** Controlled open state. */
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  /**
   * Drag controls created in the parent via `useDragControls()`.
   * The parent's handle calls `externalDragControls.start(e)` on pointerDown.
   * The motion.div uses these same controls with `dragListener=false`.
   */
  externalDragControls: ReturnType<typeof useDragControls>;
  /**
   * Fires whenever the BASE LAYER content height changes (after safe-area).
   * Use this to sync external state that depends on the reveal height
   * (e.g. map camera padding in FreeRunActive).
   */
  onRevealHeightChange?: (h: number) => void;
  /**
   * CSS max-height applied to the scrollable inner container of revealContent.
   * Defaults to `calc(60dvh - env(safe-area-inset-top, 0px))`.
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
  maxRevealHeight = 'calc(60dvh - env(safe-area-inset-top, 0px))',
}: WorkoutFlowLayerProps) {
  const controls = useAnimation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [revealH, setRevealH] = useState(0);

  // Measure BASE LAYER height (includes safe-area padding).
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
    if (isOpen) {
      controls.start({ y: revealH, transition: { type: 'spring', stiffness: 280, damping: 28 } });
    } else {
      controls.start({ y: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } });
    }
  }, [isOpen, revealH, controls]);

  // Snap decision on drag release (same thresholds as StrengthRunner).
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
      {/* Backdrop — absorbs map taps when laps are open */}
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

      {/* BASE LAYER — reveal content (RunLapsList): always at screen top.
          Covered by the TOP LAYER motion.div when closed.
          safe-area-inset-top lives HERE (on contentRef) so the measured height
          includes it — the TOP LAYER therefore slides the exact correct amount. */}
      <div className="absolute top-0 left-0 right-0 z-[49] pointer-events-none">
        <div
          ref={contentRef}
          className="bg-white overflow-hidden pointer-events-auto"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            boxShadow: isOpen ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <div style={{ maxHeight: maxRevealHeight, overflowY: 'auto' }}>
            {revealContent}
          </div>
        </div>
      </div>

      {/* TOP LAYER — handle (story bar): slides DOWN on open to expose BASE LAYER.
          dragListener=false → drag only starts from the handle's onPointerDown
          calling externalDragControls.start(e). */}
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
        className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
      >
        {children}
        {/* Fade strip — moves with the TOP LAYER */}
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
