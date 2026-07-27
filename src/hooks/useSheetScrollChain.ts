'use client';

import { useCallback, useEffect, useRef } from 'react';
import { animate, type MotionValue } from 'framer-motion';

export interface UseSheetScrollChainOptions {
  /** Whether the sheet is currently open — listeners are only attached when true. */
  isOpen: boolean;
  /** The sheet's `y` MotionValue that this hook drives during a chain gesture. */
  y: MotionValue<number>;
  /** Called to close the sheet after a full dismiss swipe. */
  onClose: () => void;
  /**
   * Optional external ref to attach to.
   * When provided the hook uses it directly; otherwise it creates an internal ref.
   */
  scrollRef?: React.RefObject<HTMLDivElement>;
  /** Minimum downward offset (px) from the snap-back position that triggers dismiss. Default: 160. */
  threshold?: number;
  /**
   * Drag resistance factor applied to the raw touch deltaY.
   * 1 = no resistance, 0.5 = half speed. Default: 0.65.
   */
  resistance?: number;
  /**
   * The y position (px) the sheet springs back to when the user releases
   * without crossing the dismiss threshold.  Defaults to 0 (fully expanded).
   * Pass `PEEK_Y_PX` to make the scroll-chain always snap back to the peek
   * position instead of the fully-expanded state.
   */
  snapBackY?: number;
}

/**
 * useSheetScrollChain — "Instagram gesture pattern" for bottom-sheet drawers.
 *
 * Attaches *non-passive* `touchmove` + `touchstart` + `touchend` listeners to
 * the scroll container.  The gesture is intercepted only when:
 *   1. The container's `scrollTop` is at 0, AND
 *   2. The user is pulling **downward** (positive deltaY).
 *
 * Once intercepted, `event.preventDefault()` stops native scrolling, and the
 * sheet's `y` MotionValue is driven in real-time — no React re-renders.
 * On release:
 *   - `currentY > threshold` → animate off-screen, then call `onClose()`
 *   - `currentY ≤ threshold` → spring back to y=0
 *
 * This allows the user to swipe-to-dismiss from anywhere inside the scroll
 * body, not just the handle pill — exactly the behaviour users expect from
 * iOS/Instagram sheets.
 *
 * The returned `scrollRef` must be attached to the scrollable container:
 *   ```tsx
 *   const { scrollRef } = useSheetScrollChain({ isOpen, y, onClose });
 *   <div ref={scrollRef} className="overflow-y-auto overscroll-contain">
 *   ```
 *
 * When passing an external ref (e.g. one already created by `useScrollAnimation`),
 * pass it via the `scrollRef` option.  The hook's returned `scrollRef` will be
 * that same ref so no separate attachment is needed.
 */
export function useSheetScrollChain({
  isOpen,
  y,
  onClose,
  scrollRef: externalRef,
  threshold = 160,
  resistance = 0.65,
  snapBackY = 0,
}: UseSheetScrollChainOptions) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalRef ?? internalRef;

  // Keep onClose stable inside the effect without re-attaching listeners.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const touchStartY = useRef(0);
  const isChaining = useRef(false);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);

  /** Cancel any in-flight spring and decide: dismiss or snap back. */
  const resolveGesture = useCallback(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    const currentY = y.get();
    if (currentY > threshold) {
      // Let AnimatePresence run the exit animation — just signal close.
      onCloseRef.current();
    } else {
      // Spring back to the designated resting position (peek or expanded).
      animRef.current = animate(y, snapBackY, {
        type: 'spring',
        damping: 40,
        stiffness: 260,
        mass: 0.8,
      });
    }
  }, [y, threshold, snapBackY]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      isChaining.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      // Guard: a missing touch or an unset touchStart yields NaN → y.set(NaN) →
      // opacity=useTransform(y,…)=NaN → "NaN is an invalid value for opacity" warning.
      if (!touch || !Number.isFinite(touchStartY.current)) return;
      const deltaY = touch.clientY - touchStartY.current;
      const scrollTop = el.scrollTop;

      if ((scrollTop <= 0 && deltaY > 0) || isChaining.current) {
        isChaining.current = true;
        // non-passive → preventDefault() is allowed here
        e.preventDefault();
        if (animRef.current) {
          animRef.current.stop();
          animRef.current = null;
        }
        y.set(Math.max(0, deltaY * resistance));
      }
    };

    const onTouchEnd = () => {
      if (!isChaining.current) return;
      isChaining.current = false;
      resolveGesture();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // MUST be non-passive
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isOpen, y, resistance, resolveGesture, scrollRef]);
  return { scrollRef, resolveGesture };
}
