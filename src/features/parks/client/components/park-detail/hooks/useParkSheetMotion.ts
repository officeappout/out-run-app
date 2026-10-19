'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useMotionValue, useTransform, useDragControls, animate, type MotionValue } from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { CLOSE_THRESHOLD, PEEK_Y_PX } from '../utils/park-detail-format';

/**
 * ParkDetailSheet's gesture + scroll-driven motion values.
 * All GPU-threaded (MotionValues) — no React re-renders while dragging or
 * scrolling. Call {@link useParkScrollProgressSync} (at the same point the
 * sheet always attached its scroll listener) to drive `scrollYMV`.
 */
export function useParkSheetMotion(isOpen: boolean, onClose: () => void) {
  const y = useMotionValue(0);
  // Opacity fades only as the user drags past the resting (85vh) anchor.
  const opacity = useTransform(y, [PEEK_Y_PX, PEEK_Y_PX + 220], [1, 0]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // ── GPU-threaded scroll animation (no React re-renders) ──────────────────
  const scrollYMV = useMotionValue(0);
  const maxScroll = 200;

  const imageOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.max(1 - progress * 0.7, 0.3);
  });
  const imageScale = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.max(1 - progress * 0.2, 0.8);
  });
  const headerOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.min(progress * 2, 1);
  });
  const heroHeight = useTransform(scrollYMV, (v) => `${Math.max(280 - v * 0.8, 60)}px`);
  const headerPointerEvents = useTransform(
    headerOpacity,
    (v) => (v < 0.05 ? 'none' : 'auto') as 'none' | 'auto',
  );
  const heroControlsPointerEvents = useTransform(
    imageOpacity,
    (v) => (v < 0.1 ? 'none' : 'auto') as 'none' | 'auto',
  );

  // Instagram-style scroll chain: intercepts down-swipe at scrollTop=0.
  // Snaps back to the full-height rest position (0), not the peek offset —
  // the sheet no longer rests at peek (see PEEK_Y_PX).
  useSheetScrollChain({ isOpen, y, onClose, scrollRef, snapBackY: 0 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.y;
    const velocity = info.velocity.y;
    const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

    if (offset > CLOSE_THRESHOLD || velocity > 500) {
      onClose();
    } else {
      // Any release short of the close threshold returns to the full-height
      // rest position — there is no separate "peek" resting state.
      animate(y, 0, SPRING);
    }
  };

  return {
    y,
    opacity,
    scrollRef,
    dragControls,
    scrollYMV,
    imageOpacity,
    imageScale,
    headerOpacity,
    heroHeight,
    headerPointerEvents,
    heroControlsPointerEvents,
    handleDragEnd,
  };
}

/** Keep `scrollYMV` in sync with the scroll container (no React re-renders). */
export function useParkScrollProgressSync(
  scrollRef: RefObject<HTMLDivElement>,
  isOpen: boolean,
  scrollYMV: MotionValue<number>,
) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    scrollYMV.set(0);
    const handler = () => scrollYMV.set(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [isOpen, scrollYMV]); // eslint-disable-line react-hooks/exhaustive-deps
}
