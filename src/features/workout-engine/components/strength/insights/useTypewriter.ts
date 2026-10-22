'use client';

/**
 * Types `text` in over at most TYPE_TOTAL_MS (1.2s). Reduced motion → the whole text at once.
 * Returns how many characters to show.
 */
import { useEffect, useState } from 'react';

export const TYPE_TOTAL_MS = 1200;
const MAX_STEP_MS = 40;

/** ms per character so the whole line lands within TYPE_TOTAL_MS. Pure (tested). */
export function typeStepMs(length: number): number {
  if (length <= 0) return 0;
  return Math.max(8, Math.min(MAX_STEP_MS, Math.floor(TYPE_TOTAL_MS / length)));
}

export function useTypewriter(text: string | null, reducedMotion: boolean): number {
  const len = text?.length ?? 0;
  const [shown, setShown] = useState(reducedMotion ? len : 0);

  useEffect(() => {
    if (!text) {
      setShown(0);
      return;
    }
    if (reducedMotion) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const step = typeStepMs(text.length);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= text.length) clearInterval(id);
    }, step);
    return () => clearInterval(id);
  }, [text, reducedMotion]);

  return Math.min(shown, len);
}
