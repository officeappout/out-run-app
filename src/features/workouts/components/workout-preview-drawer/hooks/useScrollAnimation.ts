'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, type MotionValue } from 'framer-motion';

export interface UseScrollAnimationReturn {
  /** Attach to the scrollable container; the hook subscribes to its `scroll` event. */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** Hero image opacity: 1 → 0 across the first 200px of scroll. */
  imageOpacity: MotionValue<number>;
  /** Hero image scale: 1 → 0.8 across the first 200px of scroll. */
  imageScale: MotionValue<number>;
  /** Sticky header opacity: 0 → 1 across the first 100px of scroll. */
  headerOpacity: MotionValue<number>;
  /** Hero container height as a CSS string: '320px' → '64px'. */
  dynamicHeight: MotionValue<string>;
  /** Workout title scale: 1 → 0.7 (iOS collapsing-title behaviour). */
  titleScale: MotionValue<number>;
  /** Workout title y-offset: 0 → 20px. */
  titleY: MotionValue<number>;
}

/**
 * Tracks the drawer's scroll position and derives hero / header animation
 * values using Framer Motion MotionValues + `useTransform`.
 *
 * **Why MotionValues instead of React state:**
 * The previous `useState`-based implementation called `setScrollY` on every
 * scroll tick (60–120 fps on ProMotion devices), which triggered a full React
 * re-render chain: `WorkoutPreviewDrawer` → `useMemo` recalculate 6 values →
 * hero re-render → `DrawerHeader` re-render → layout recalculation.  Under
 * time pressure this caused the jitter visible during fast scrolling.
 *
 * With MotionValues the scroll listener now calls `scrollYMV.set(n)`, which
 * propagates exclusively through Framer's internal subscriber graph on the
 * compositor thread — zero React re-renders, zero layout recalculations.
 */
export function useScrollAnimation(isOpen: boolean): UseScrollAnimationReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollYMV = useMotionValue(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isOpen) return;

    // Reset on each open so the hero always starts fully visible.
    scrollYMV.set(0);

    const handler = () => scrollYMV.set(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [isOpen, scrollYMV]);

  // All transform formulae mirror the original clamp expressions exactly so
  // the visual output is identical; only the execution path changes.

  const imageOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / 200, 1);
    return Math.max(1 - progress * 0.7, 0);
  });

  const imageScale = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / 200, 1);
    return Math.max(1 - progress * 0.2, 0.8);
  });

  const headerOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / 200, 1);
    return Math.min(progress * 2, 1);
  });

  // Returns a CSS string so it can be used directly with `style={{ height }}`.
  const dynamicHeight = useTransform(
    scrollYMV,
    (v) => `${Math.max(320 - v * 0.8, 64)}px`,
  );

  const titleScale = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / 200, 1);
    return Math.max(1 - progress * 0.3, 0.7);
  });

  const titleY = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / 200, 1);
    return progress * 20;
  });

  return {
    scrollContainerRef,
    imageOpacity,
    imageScale,
    headerOpacity,
    dynamicHeight,
    titleScale,
    titleY,
  };
}
