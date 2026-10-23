'use client';

import { useCallback, useEffect, useState } from 'react';

/** Callback ref + ResizeObserver -> the node's border-box height (0 until measured). */
export function useMeasuredHeight(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [h, setH] = useState(0);
  const ref = useCallback((n: HTMLElement | null) => setNode(n), []);
  useEffect(() => {
    if (!node) { setH(0); return; }
    const read = () => setH(Math.round(node.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(read);
    obs.observe(node);
    return () => obs.disconnect();
  }, [node]);
  return [ref, h];
}
