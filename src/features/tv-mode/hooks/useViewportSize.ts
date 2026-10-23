'use client';

import { useEffect, useState } from 'react';

export interface ViewportSize { width: number; height: number }

/** Window size in px (a 1080p TV on the server) — feeds the wide player's layout decision on the TV. */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({ width: 1920, height: 1080 });
  useEffect(() => {
    const sync = () => {
      const width = window.innerWidth || 1920;
      const height = window.innerHeight || 1080;
      setSize((p) => (p.width === width && p.height === height ? p : { width, height }));
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  return size;
}
