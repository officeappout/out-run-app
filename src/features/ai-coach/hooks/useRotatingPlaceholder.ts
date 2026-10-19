'use client';

import { useEffect, useState } from 'react';
import { PLACEHOLDER_ROTATE_MS } from '@/lib/ai/coach/suggestions/placeholders';

/** Kelly phase 2 — cycles the input hints while `active` (the box is empty). Reduced motion → no cycling. */
export function useRotatingPlaceholder(hints: string[], active: boolean, fallback: string): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || hints.length < 2) return;
    let reduce = false;
    try {
      reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      reduce = false;
    }
    if (reduce) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % hints.length), PLACEHOLDER_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active, hints.length]);
  return hints.length ? hints[i % hints.length] : fallback;
}
