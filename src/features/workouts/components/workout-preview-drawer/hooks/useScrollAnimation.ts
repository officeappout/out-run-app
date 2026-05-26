'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface ScrollAnimationValues {
  /** Hero image opacity (1 → 0.3 across the 200px scroll range). */
  imageOpacity: number;
  /** Hero image scale (1 → 0.8). */
  imageScale: number;
  /** Sticky header opacity (0 → 1 across the first ~100px). */
  headerOpacity: number;
  /** Hero container height in px (320 → 64 as the user scrolls down). */
  dynamicHeight: number;
  /** Workout-title scale (1 → 0.7 to mirror iOS collapsing-title behaviour). */
  titleScale: number;
  /** Workout-title y-offset in px (0 → 20). */
  titleY: number;
}

interface UseScrollAnimationReturn extends ScrollAnimationValues {
  /** Attach to the scrollable container; the hook subscribes to its `scroll` event. */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** Current `scrollTop` value — exposed for consumers that need the raw number. */
  scrollY: number;
}

/** Clamp the input to a finite number; fall back when NaN / Infinity slips through. */
const safe = (v: number, fallback: number): number =>
  Number.isFinite(v) ? v : fallback;

/**
 * Tracks the drawer's scroll position and derives the 6 hero / header
 * animation values from it.
 *
 * The derivations are wrapped in a single `useMemo` so they only
 * re-evaluate when `scrollY` actually changes — not on every unrelated
 * parent re-render (audio toggle, favorites mutations, share state, …).
 * This resolves Hotspot (c) from the discovery report.
 */
export function useScrollAnimation(isOpen: boolean): UseScrollAnimationReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !isOpen) return;

    const handleScroll = () => {
      setScrollY(scrollContainer.scrollTop);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  const values = useMemo<ScrollAnimationValues>(() => {
    const safeScrollY = safe(scrollY, 0);
    const maxScroll = 200;
    const scrollProgress = safe(Math.min(safeScrollY / maxScroll, 1), 0);

    const imageOpacity = safe(Math.max(1 - scrollProgress * 0.7, 0), 1);
    const imageScale = safe(Math.max(1 - scrollProgress * 0.2, 0.8), 1);
    const headerOpacity = safe(Math.min(scrollProgress * 2, 1), 0);

    const initialHeight = 320;
    const minHeight = 64;
    const dynamicHeight = safe(
      Math.max(initialHeight - safeScrollY * 0.8, minHeight),
      minHeight,
    );

    const titleScale = safe(Math.max(1 - scrollProgress * 0.3, 0.7), 1);
    const titleY = safe(scrollProgress * 20, 0);

    return { imageOpacity, imageScale, headerOpacity, dynamicHeight, titleScale, titleY };
  }, [scrollY]);

  return {
    scrollContainerRef,
    scrollY,
    ...values,
  };
}
