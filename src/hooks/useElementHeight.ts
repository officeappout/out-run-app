'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live border-box height of an element (ResizeObserver). Returns a callback ref to put
 * on the element and the last measured height (null until measured / without
 * ResizeObserver). The observer is always disconnected when the element unmounts.
 */
export function useElementHeight<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setHeight(el.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => {
      const h = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.target.getBoundingClientRect().height;
      if (typeof h === 'number') setHeight((prev) => (prev === h ? prev : h));
    });
    observer.current.observe(el);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, height];
}
