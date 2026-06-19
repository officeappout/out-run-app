'use client';

/**
 * WorkoutFlowLayer — slide-down content overlay for contextual workout data.
 *
 * Mechanics:
 *   • Closed: content hidden above (translateY(-100%)); trigger strip at topOffset.
 *   • Open: card slides DOWN by `contentHeight` revealing content above the map.
 *   • Open gesture: drag DOWN on the external drag handle (e.g. StoryBar) via
 *     `externalDragControls`, OR drag down on the trigger strip directly.
 *   • Dismiss: drag UP on the trigger strip (> threshold) OR tap the backdrop.
 *
 * dragListener=false — the motion.div never captures pointer events itself;
 * drag must be initiated via dragControls.start(e) from a handle.
 *
 * Layer: z-[45] — above map (z-0), above MetricsDrawer (z-40), below StoryBar (z-50).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, useDragControls, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /** Content to reveal when the layer is open (e.g. RunLapsList). */
  children: React.ReactNode;
  /** Controls whether the layer is currently open. */
  isOpen: boolean;
  /** Called when the user dismisses the layer (drag up or backdrop tap). */
  onClose: () => void;
  /**
   * Called when a drag-down gesture (from the trigger strip or externalDragControls)
   * exceeds the open threshold. The parent should flip isOpen to true.
   */
  onOpen?: () => void;
  /**
   * External drag controls from the parent (e.g. from a StoryBar drag handle).
   * When provided, the motion.div uses these controls instead of its internal ones,
   * so the parent can start the drag from any element via dragControls.start(e).
   */
  externalDragControls?: ReturnType<typeof useDragControls>;
  /**
   * CSS value for the top of the trigger/panel area.
   * Pass a calc() expression to combine safe-area-inset with a pixel offset.
   * Default: 0.
   */
  topOffset?: string | number;
}

const VELOCITY_THRESHOLD = 150;
const DRAG_OPEN_THRESHOLD = 30;   // px — small downward drag opens
const DRAG_CLOSE_THRESHOLD = 50;  // px — drag up to close

export default function WorkoutFlowLayer({
  children,
  isOpen,
  onClose,
  onOpen,
  externalDragControls,
  topOffset = 0,
}: WorkoutFlowLayerProps) {
  const controls = useAnimation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(0);
  const internalDragControls = useDragControls();
  const effectiveDragControls = externalDragControls ?? internalDragControls;

  // Measure content height so we know how far to slide down.
  useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => {
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (Number.isFinite(h) && h > 0) setContentH(Math.round(h));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Animate to open/close when state changes.
  useEffect(() => {
    if (isOpen) {
      controls.start({ y: contentH, transition: { type: 'spring', stiffness: 300, damping: 28 } });
    } else {
      controls.start({ y: 0, transition: { type: 'spring', stiffness: 340, damping: 32 } });
    }
  }, [isOpen, contentH, controls]);

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const vy = info.velocity.y;
      const offset = info.offset.y;

      if (isOpen) {
        // Flick up OR drag up past threshold → dismiss.
        if (vy < -VELOCITY_THRESHOLD || offset < -DRAG_CLOSE_THRESHOLD) {
          onClose();
        } else {
          controls.start({ y: contentH, transition: { type: 'spring', stiffness: 300, damping: 28 } });
        }
      } else {
        // Drag down past threshold → open.
        if (vy > VELOCITY_THRESHOLD || offset > DRAG_OPEN_THRESHOLD) {
          onOpen?.();
        } else {
          controls.start({ y: 0, transition: { type: 'spring', stiffness: 340, damping: 32 } });
        }
      }
    },
    [isOpen, contentH, controls, onClose, onOpen],
  );

  return (
    <>
      {/* Backdrop — absorbs taps when open to prevent map interaction */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[44] pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-down panel — drag only starts from explicit handles */}
      <motion.div
        drag="y"
        dragControls={effectiveDragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: contentH }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={{ y: 0 }}
        className="absolute left-0 right-0 z-[45] pointer-events-none"
        style={{ top: topOffset, touchAction: 'pan-x' }}
      >
        {/* Content area (slides in from above) */}
        <div
          ref={contentRef}
          className="pointer-events-auto bg-white"
          style={{
            transform: 'translateY(-100%)',
            boxShadow: isOpen ? '0 8px 32px rgba(0,0,0,0.14)' : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
        >
          {children}
        </div>

        {/* Trigger/grabber strip — drag handle for both open (initiate) and close (pull up) */}
        <div
          className="pointer-events-auto flex justify-center items-center"
          style={{
            height: 28,
            touchAction: 'none',
            background: isOpen ? 'rgba(255,255,255,0.92)' : 'transparent',
            borderRadius: isOpen ? '0 0 12px 12px' : undefined,
            cursor: 'grab',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            effectiveDragControls.start(e);
          }}
        >
          {/* Grabber pill — only visible when open (close affordance) */}
          {isOpen && (
            <div
              className="rounded-full"
              style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.2)' }}
              aria-hidden="true"
            />
          )}
        </div>
      </motion.div>
    </>
  );
}
