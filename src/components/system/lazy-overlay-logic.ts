/**
 * Pure helpers behind lazyOverlay.tsx (kept separate so they're unit-testable
 * without a DOM).
 */
import { scheduleIdle } from '@/lib/scheduleIdle';

/**
 * "Sticky" mount: an overlay mounts the first time it opens and then STAYS
 * mounted. That keeps every close animation (AnimatePresence exit) and every
 * bit of state the overlay kept between opens exactly as before — the only
 * difference from a static import is that nothing is downloaded, parsed or
 * mounted until the first open.
 */
export function stickyMounted(wasMounted: boolean, isOpen: boolean): boolean {
  return wasMounted || isOpen;
}

/**
 * Runs `fn` once the screen has settled: waits `delayMs` (so first paint and
 * the page's own first data fetches go first), then the next idle slot
 * (src/lib/scheduleIdle — rIC with a Safari/WKWebView setTimeout fallback).
 * Returns a canceller.
 */
export function scheduleAfterSettle(fn: () => void, delayMs: number): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelIdle: (() => void) | null = null;
  const timer = setTimeout(() => {
    cancelIdle = scheduleIdle(fn, { timeoutMs: 5000 });
  }, delayMs);
  return () => {
    clearTimeout(timer);
    cancelIdle?.();
  };
}
