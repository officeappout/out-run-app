'use client';

import { useEffect, useRef, useState } from 'react';

interface UseScrollDirectionOptions {
  /**
   * Minimum delta (px) before a direction switch is registered. Prevents
   * jitter from sub-pixel inertial scrolls on iOS.
   * @default 8
   */
  threshold?: number;
  /**
   * Distance from the top (px) below which the header is always shown.
   * Mirrors Instagram / X behaviour where the bar sticks while you're
   * still near the top of the feed.
   * @default 80
   */
  topOffset?: number;
  /**
   * Optional explicit scroll container. If omitted, the hook walks up the
   * DOM from `anchorRef` (or document.body) looking for the app's main
   * scroll container (the <main> element rendered by ClientLayout).
   */
  scrollContainer?: HTMLElement | null;
  /**
   * Reference element used to locate the scroll container when
   * `scrollContainer` is not provided.
   */
  anchorRef?: React.RefObject<HTMLElement>;
}

/**
 * Tracks vertical scroll direction on the app's main scroll container and
 * returns whether a top-anchored header should currently be hidden.
 *
 * Behaviour:
 * - Scrolling DOWN past `topOffset` → returns `true` (hide header).
 * - Scrolling UP at any position    → returns `false` (show immediately).
 * - Above `topOffset`               → always returns `false`.
 *
 * The reading is rAF-throttled so the callback runs at most once per frame.
 */
export function useScrollDirection({
  threshold = 8,
  topOffset = 80,
  scrollContainer,
  anchorRef,
}: UseScrollDirectionOptions = {}): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el =
      scrollContainer ??
      // Walk up from the anchor to find an actually-scrollable ancestor.
      (anchorRef?.current
        ? findScrollableAncestor(anchorRef.current)
        : null) ??
      // Fall back to the app's primary scroll container in ClientLayout.
      (typeof document !== 'undefined'
        ? (document.querySelector('main') as HTMLElement | null)
        : null);

    if (!el) return;

    lastY.current = el.scrollTop;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop;
        const diff = y - lastY.current;

        // We call `setHidden(...)` unconditionally and rely on React's
        // built-in Object.is bail-out to skip re-renders when the value
        // is unchanged. The previous version guarded with `if (hidden)`
        // / `if (!hidden)` to avoid unnecessary setState calls — but
        // `hidden` was read from a stale closure (the effect intentionally
        // doesn't depend on `hidden` to keep the listener stable), so
        // after the first toggle the guards always read `false` and the
        // "show again" branch never fired. Manifested most visibly on
        // the Android WebView where iOS-style focus-driven re-mounts
        // didn't paper over the bug.
        if (y < topOffset) {
          setHidden(false);
        } else if (diff > threshold) {
          setHidden(true);
        } else if (diff < -threshold) {
          setHidden(false);
        }

        if (Math.abs(diff) > threshold) {
          lastY.current = y;
        }
        ticking.current = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollContainer, anchorRef, threshold, topOffset]);

  return hidden;
}

function findScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
}
