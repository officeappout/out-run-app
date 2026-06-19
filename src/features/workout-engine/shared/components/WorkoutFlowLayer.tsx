'use client';

/**
 * WorkoutFlowLayer — slide-down content overlay for contextual workout data.
 *
 * Mechanics:
 *   • Closed: only the trigger handle (28 px) is visible at the top of the
 *     content area (below the StoryBar). The card's motion.div sits at y=0
 *     and overflow is hidden so the content is off-screen above.
 *   • Open: the card slides DOWN by `contentHeight` (measured via
 *     ResizeObserver) revealing the content slot above the map.
 *   • Dismiss: drag back up (velocity > 150 px/s or offset > 50 px) OR tap
 *     the backdrop that appears behind the content when open.
 *
 * Touch isolation:
 *   The trigger strip uses `touchAction: none` to intercept the pointer
 *   before the MetricsDrawer (below it) can pick it up. When open, the
 *   backdrop absorbs taps so they don't fall through to the map.
 *
 * Layer: z-[45] — above the map (z-0), above MetricsDrawer (z-40), but
 * BELOW StoryBar (z-50) so the goal bar is never covered.
 *
 * Content slot:
 *   Pass any React node. FreeRunActive passes <RunLapsList />.
 *   Future callers can pass <WorkoutPlaylist />, <GroupRoster />, etc.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useAnimation, type PanInfo } from 'framer-motion';

export interface WorkoutFlowLayerProps {
  /** Content to reveal when the layer is open (e.g. RunLapsList). */
  children: React.ReactNode;
  /** Controls whether the layer is currently open. */
  isOpen: boolean;
  /** Called when the user dismisses the layer (drag up or backdrop tap). */
  onClose: () => void;
  /**
   * Handle affordance shown when closed. Defaults to a small pill + label.
   * Pass custom JSX for branded affordances.
   */
  trigger?: React.ReactNode;
  /**
   * Label shown in the default trigger affordance.
   * Ignored when `trigger` is provided.
   */
  triggerLabel?: string;
  /**
   * CSS value for the top of the trigger/panel area.
   * Pass a calc() expression to combine safe-area-inset with a pixel offset,
   * e.g. `'calc(env(safe-area-inset-top, 0px) + 56px)'`.
   * Default: 0.
   */
  topOffset?: string | number;
}

const VELOCITY_THRESHOLD = 150; // px/s — faster than MetricsDrawer since we want snappy dismiss
const DRAG_DISMISS_THRESHOLD = 50; // px — small drag is enough to dismiss

export default function WorkoutFlowLayer({
  children,
  isOpen,
  onClose,
  trigger,
  triggerLabel = 'הקפות',
  topOffset = 0,
}: WorkoutFlowLayerProps) {
  const controls = useAnimation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(0);

  // Measure the content height so we know how far to slide down.
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

      // Flick up OR drag up past threshold → dismiss.
      if (vy < -VELOCITY_THRESHOLD || offset < -DRAG_DISMISS_THRESHOLD) {
        onClose();
      } else {
        // Snap back to open position.
        controls.start({ y: contentH, transition: { type: 'spring', stiffness: 300, damping: 28 } });
      }
    },
    [contentH, controls, onClose],
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

      {/* Slide-down panel */}
      <motion.div
        drag={isOpen ? 'y' : false}
        dragConstraints={{ top: 0, bottom: contentH }}
        dragElastic={0.1}
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

        {/* Trigger handle — always at y=0 (top of the panel area) */}
        <div
          className="pointer-events-auto flex justify-center items-center"
          style={{
            height: 28,
            touchAction: 'none',
            background: isOpen ? 'rgba(255,255,255,0.95)' : 'transparent',
            borderRadius: isOpen ? '0 0 12px 12px' : undefined,
          }}
          onClick={() => { if (!isOpen) { /* onOpen handled by parent */ } }}
        >
          {trigger ?? (
            <DefaultTrigger label={triggerLabel} isOpen={isOpen} />
          )}
        </div>
      </motion.div>
    </>
  );
}

function DefaultTrigger({ label, isOpen }: { label: string; isOpen: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{
        background: isOpen ? 'transparent' : 'rgba(0,0,0,0.55)',
        backdropFilter: isOpen ? undefined : 'blur(8px)',
        WebkitBackdropFilter: isOpen ? undefined : 'blur(8px)',
        transition: 'background 0.2s ease',
      }}
    >
      <span
        className="text-xs font-bold tracking-wide"
        style={{ color: isOpen ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)', direction: 'rtl' }}
      >
        {label}
      </span>
      <svg
        width="10"
        height="6"
        viewBox="0 0 10 6"
        fill="none"
        aria-hidden="true"
        style={{
          color: isOpen ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.7)',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s ease',
        }}
      >
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
