'use client';

/**
 * usePublishedHeaderHeight — measures a v2 player's floating header and
 * publishes its height to useMapStore.storyBarHeight (the map camera padding,
 * the turn card and the recenter pill sit under it). Cleared on unmount.
 */

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';

export function usePublishedHeaderHeight(initial = 96) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initial);
  const setStoryBarHeight = useMapStore((s) => s.setStoryBarHeight);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) setHeight(Math.round(h));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    setStoryBarHeight(height);
    return () => setStoryBarHeight(0);
  }, [height, setStoryBarHeight]);
  return { ref, height };
}
