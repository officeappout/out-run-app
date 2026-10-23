'use client';

/**
 * useWideLayout — measures the player's container (falls back to the window)
 * and returns the wide decision + panel scale. Container-based, so it follows
 * a resized desktop window, a rotated phone, a tab-cast and a TV browser alike.
 * `enabled=false` (flag off) → never wide, no listeners.
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { computeWideLayout, WIDE_OFF, type Size, type WideLayout } from './wide-layout-logic';

export function useWideLayout(ref: RefObject<HTMLElement | null>, enabled = true): WideLayout {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    const read = () => {
      const r = el?.getBoundingClientRect();
      const width = Math.round(r && r.width > 0 ? r.width : window.innerWidth);
      const height = Math.round(r && r.height > 0 ? r.height : window.innerHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    read();
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(read);
      ro.observe(el);
    }
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, [ref, enabled]);

  return useMemo(() => (enabled ? computeWideLayout(size) : WIDE_OFF), [enabled, size]);
}
