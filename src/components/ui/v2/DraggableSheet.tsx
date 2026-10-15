'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion';
import { EASE_V2 } from './tokens';
import { resolveSnap, rubberBand } from './logic';

export interface DraggableSheetProps {
  /**
   * Visible heights the sheet can rest at. Values ≤ 1 are fractions of the
   * viewport height; larger values are px. Order doesn't matter.
   */
  snapPoints: number[];
  /** Index into `snapPoints` (as given) to open at. Defaults to the largest. */
  initialSnap?: number;
  /** Fires with the index (into `snapPoints` as given) the sheet settled on. */
  onSnapChange?: (index: number) => void;
  /** Rendered inside the drag zone, under the grab handle (title, tabs…). */
  header?: ReactNode;
  /** Pinned under the scroll area — explicit actions live here, never on drag. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Registered z-band (.cursorrules). Default 100 = full-screen overlays/summary. */
  zIndex?: number;
  className?: string;
  /** Accessible name for the sheet region. */
  ariaLabel?: string;
}

const SSR_VIEWPORT = 800;

function toPx(point: number, vh: number): number {
  return point <= 1 ? Math.round(point * vh) : point;
}

/**
 * DraggableSheet — bottom sheet that collapses by dragging the handle/header
 * and snaps between heights on the v2 curve. Dragging never dismisses or
 * triggers an action: closing/saving is always an explicit button in
 * `footer` (the old summary drawer exited-and-saved on a stray tap).
 *
 * The smallest snap should be ≥ header + footer height so the collapsed
 * state still shows the grab handle above the pinned footer.
 *
 * Only the header zone starts a drag (dragControls), so the content keeps its
 * own native scroll. Past the min/max snaps the sheet rubber-bands.
 */
export default function DraggableSheet({
  snapPoints,
  initialSnap,
  onSnapChange,
  header,
  footer,
  children,
  zIndex = 100,
  className = '',
  ariaLabel,
}: DraggableSheetProps) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const [vh, setVh] = useState(SSR_VIEWPORT);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);

  // The footer is pinned to the viewport (outside the translated sheet) so an
  // explicit action stays reachable at every snap; the sheet pads its scroll
  // area by the footer's measured height.
  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight));
    ro.observe(el);
    setFooterH(el.offsetHeight);
    return () => ro.disconnect();
  }, [footer]);

  useEffect(() => {
    const update = () => setVh(window.innerHeight || SSR_VIEWPORT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const px = useMemo(() => snapPoints.map((p) => toPx(p, vh)), [snapPoints, vh]);
  const maxH = Math.max(...px);
  const minH = Math.min(...px);
  const startIndex = initialSnap ?? px.indexOf(maxH);
  const [snapIndex, setSnapIndex] = useState(startIndex);

  // y = how far the full-height sheet is pushed down. Visible height = maxH - y.
  const y = useMotionValue(maxH - (px[startIndex] ?? maxH));

  const settle = useCallback(
    (index: number) => {
      const target = maxH - px[index];
      if (reduce) y.set(target);
      else animate(y, target, { duration: 0.42, ease: EASE_V2 });
      setSnapIndex(index);
      onSnapChange?.(index);
    },
    [maxH, px, reduce, y, onSnapChange],
  );

  // Re-anchor when the viewport changes (rotation, keyboard).
  useEffect(() => {
    y.set(maxH - (px[snapIndex] ?? maxH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxH]);

  const onDrag = (_: unknown, info: PanInfo) => {
    const raw = y.get();
    const lo = 0; // fully open
    const hi = maxH - minH; // fully collapsed
    if (raw < lo) y.set(lo + rubberBand(raw - lo, maxH));
    else if (raw > hi) y.set(hi + rubberBand(raw - hi, maxH));
    void info;
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const released = maxH - y.get();
    const target = resolveSnap(px, released, info.velocity.y);
    settle(px.indexOf(target));
  };

  const toggle = () => {
    // Keyboard/tap on the handle: cycle between the largest and smallest snap.
    const next = px[snapIndex] === maxH ? px.indexOf(minH) : px.indexOf(maxH);
    settle(next);
  };

  return (
    <>
    <motion.section
      aria-label={ariaLabel}
      data-v2-sheet
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={0}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      style={{ y, height: maxH, zIndex }}
      className={`fixed inset-x-0 bottom-0 flex flex-col bg-white rounded-t-[28px] shadow-v2-sheet overflow-hidden ${className}`}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={px[snapIndex] === maxH ? 'כווץ' : 'הרחב'}
          aria-expanded={px[snapIndex] === maxH}
          className="block w-full pt-2.5 pb-1.5"
        >
          <span className="block mx-auto w-10 h-[5px] rounded-full bg-[#d5dde2]" />
        </button>
        {header}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ paddingBottom: footerH }}>
        {children}
      </div>
    </motion.section>
    {footer && (
      <div
        ref={footerRef}
        data-v2-sheet-footer
        style={{ zIndex: zIndex + 1 }}
        className="fixed inset-x-0 bottom-0 border-t border-v2-hairline bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {footer}
      </div>
    )}
    </>
  );
}
