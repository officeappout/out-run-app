'use client';

import { useEffect, useState } from 'react';
import { readSafeAreaTopPx } from './safeAreaTop';

/**
 * Safe-area top inset in px (see safeAreaTop.ts). Measured after mount and on
 * orientation change; 0 during SSR / the first render.
 */
export function useSafeAreaTop(): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const sync = () => setTop(readSafeAreaTopPx());
    sync();
    window.addEventListener('orientationchange', sync);
    return () => window.removeEventListener('orientationchange', sync);
  }, []);
  return top;
}
