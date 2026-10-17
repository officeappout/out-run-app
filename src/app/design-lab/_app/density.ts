'use client';

import { useSyncExternalStore } from 'react';

/**
 * Lab-only density switch: "regular" (round 1–4 sizes) vs "compact" (~10%
 * smaller headings, cards, buttons, bars; body text unchanged). Stored in
 * localStorage so every lab screen follows the same choice.
 */
export type Density = 'regular' | 'compact' | 'dense';

const KEY = 'design-lab-density';
const listeners = new Set<() => void>();
// 'dense' is the locked "middle": compact cards, dense spacing and bars.
let mem: Density = 'dense';

function read(): Density {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'compact' || v === 'regular' || v === 'dense' ? v : mem;
  } catch {
    return mem;
  }
}

export function setDensity(d: Density) {
  mem = d;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* private mode — the switch still works for this page */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, read, () => 'dense');
}

/** true when compact or dense (dense keeps every compact reduction). */
export function useCompact(): boolean {
  return useDensity() !== 'regular';
}

/** Pick a value per density. */
export function pick<T>(d: Density, regular: T, compact: T, dense: T): T {
  return d === 'dense' ? dense : d === 'compact' ? compact : regular;
}

/* ── streak style (lab switch, same storage pattern) ───────────────────── */

/**
 * capsule — faint wash behind the run (round 5)
 * thread  — a glowing gradient line through the flames, brighter toward today
 * heat    — a soft gradient glow behind the run; flames grow along it
 * flow    — a dotted line that flows toward today
 */
export type StreakStyle = 'capsule' | 'thread' | 'heat' | 'flow';
const SKEY = 'design-lab-streak';
let smem: StreakStyle = 'capsule';
const slisteners = new Set<() => void>();

function sread(): StreakStyle {
  try {
    const v = localStorage.getItem(SKEY);
    return v === 'capsule' || v === 'thread' || v === 'heat' || v === 'flow' ? v : smem;
  } catch {
    return smem;
  }
}

export function setStreakStyle(s: StreakStyle) {
  smem = s;
  try {
    localStorage.setItem(SKEY, s);
  } catch {
    /* private mode */
  }
  slisteners.forEach((l) => l());
}

export function useStreakStyle(): StreakStyle {
  return useSyncExternalStore(
    (l) => {
      slisteners.add(l);
      return () => slisteners.delete(l);
    },
    sread,
    () => 'capsule',
  );
}
