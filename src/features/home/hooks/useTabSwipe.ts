'use client';

/**
 * Pilot AI1: touch handlers for a horizontal tab swipe on an area (enable_pilot_ah_v1). A gesture
 * that starts inside a horizontal carousel of its own ([data-v2-paged-carousel]) is left to it.
 * Vertical scroll stays native: the wrapper sets touch-action pan-y; nothing is prevented.
 */
import { useRef } from 'react';
import { tabSwipeTarget } from '../utils/tab-swipe';

export function useTabSwipe<T>(a: { enabled: boolean; tabs: readonly T[]; active: T; isRtl: boolean; onChange: (t: T) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!a.enabled) return {};
  return {
    style: { touchAction: 'pan-y' as const },
    onTouchStart: (e: React.TouchEvent) => {
      const inCarousel = (e.target as HTMLElement).closest?.('[data-v2-paged-carousel]');
      const t = e.touches[0];
      start.current = inCarousel || !t ? null : { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const next = tabSwipeTarget(a.tabs, a.active, t.clientX - s.x, t.clientY - s.y, a.isRtl);
      if (next != null) a.onChange(next);
    },
  };
}
