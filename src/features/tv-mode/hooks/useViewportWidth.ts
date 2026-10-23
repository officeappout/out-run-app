'use client';

import { useEffect, useState } from 'react';

/** Window width in px (1920 on the server) — sizes the wide player's hero clock to the TV. */
export function useViewportWidth(): number {
  const [w, setW] = useState(1920);
  useEffect(() => {
    const sync = () => setW(window.innerWidth || 1920);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  return w;
}
