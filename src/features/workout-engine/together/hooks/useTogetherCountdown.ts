'use client';

import { useEffect, useState } from 'react';
import { countdownAt, type CountdownView } from '../core/countdown';

/**
 * Re-renders at each digit change until GO. `startAtServerMs` comes from the
 * attendance doc; `offsetMs` from usePresence (server − local clock).
 */
export function useTogetherCountdown(startAtServerMs: number | null, offsetMs: number): CountdownView {
  const [, force] = useState(0);
  const view = countdownAt(startAtServerMs, Date.now(), offsetMs);
  useEffect(() => {
    if (view.phase !== 'counting') return;
    const id = setTimeout(() => force((n) => n + 1), Math.max(30, view.msToNext));
    return () => clearTimeout(id);
  });
  return view;
}
