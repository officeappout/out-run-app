'use client';

/**
 * Week builder drag — which day row is under the finger. Day rows register their element;
 * a drag reports the pointer's viewport Y (the agenda's own hit-test, RollingAgenda).
 */
import { useCallback, useRef } from 'react';

/** Viewport Y of a drag event (pointer, mouse or touch); null when unknown. */
export function clientYOf(e: MouseEvent | TouchEvent | PointerEvent): number | null {
  if ('clientY' in e && typeof e.clientY === 'number') return e.clientY;
  const t = (e as TouchEvent).changedTouches?.[0] ?? (e as TouchEvent).touches?.[0];
  return t ? t.clientY : null;
}

export function useDayHitTest() {
  const rows = useRef<Array<HTMLElement | null>>(Array(7).fill(null));
  const rowRef = useCallback((dow: number) => (el: HTMLElement | null) => {
    rows.current[dow] = el;
  }, []);
  const dowAt = useCallback((clientY: number | null): number | null => {
    if (clientY == null) return null;
    for (let dow = 0; dow < 7; dow++) {
      const r = rows.current[dow]?.getBoundingClientRect();
      if (r && clientY >= r.top && clientY <= r.bottom) return dow;
    }
    return null;
  }, []);
  return { rowRef, dowAt };
}
