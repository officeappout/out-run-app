'use client';

/**
 * useInfoLoop — the "i" sheet demos' clock: steps through `durations` (ms per phase) and loops.
 * Reduced motion (or `enabled` false): stays on phase 0, nothing moves.
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export function useInfoLoop(durations: readonly number[], enabled = true): { phase: number; reduced: boolean } {
  const reduced = useReducedMotion() === true;
  const [phase, setPhase] = useState(0);
  const run = enabled && !reduced && durations.length > 1;
  // By value: callers rebuild the array on every render.
  const key = durations.join(',');
  useEffect(() => {
    if (!run) {
      setPhase(0);
      return;
    }
    const ms = key.split(',').map(Number);
    const id = setTimeout(() => setPhase((p) => (p + 1) % ms.length), ms[phase] ?? 1000);
    return () => clearTimeout(id);
  }, [run, phase, key]);
  return { phase: run ? phase : 0, reduced };
}
