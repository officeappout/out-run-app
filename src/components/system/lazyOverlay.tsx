'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import WidgetBoundary from './WidgetBoundary';
import { scheduleAfterSettle, stickyMounted } from './lazy-overlay-logic';

export type LazyOverlayComponent<P> = ComponentType<P> & {
  /** Starts downloading the overlay's chunk (idempotent). */
  preload: () => void;
};

/**
 * Turns a `next/dynamic` overlay (drawer / modal / sheet) into a drop-in
 * replacement for the statically imported one:
 *
 *  - not mounted (and its chunk not required) until `isOpen(props)` is first
 *    true — then sticky-mounted forever, so exit animations and kept state
 *    behave exactly like the static version (see stickyMounted);
 *  - wrapped in a WidgetBoundary, so an overlay that throws closes itself
 *    and reports to Sentry instead of taking down the whole screen; the next
 *    open retries.
 *
 * Pass `isOpen: () => true` for overlays the parent already mounts only while
 * open (`{open && <X/>}`) or that must mount right away (lazy chunk only).
 *
 * The `dynamic(() => import('…'), { ssr: false })` call stays at the call
 * site (Next's compiler needs the literal import there); `load` repeats the
 * same import for idle preloading — webpack resolves both to one chunk.
 */
export function lazyOverlay<P extends object>(
  name: string,
  Lazy: ComponentType<P>,
  isOpen: (props: P) => boolean,
  load: () => Promise<unknown>,
): LazyOverlayComponent<P> {
  function LazyOverlay(props: P) {
    const open = isOpen(props);
    const mountedRef = useRef(false);
    mountedRef.current = stickyMounted(mountedRef.current, open);
    if (!mountedRef.current) return null;
    return (
      <WidgetBoundary name={`overlay.${name}`} resetKeys={[open]}>
        <Lazy {...props} />
      </WidgetBoundary>
    );
  }
  LazyOverlay.displayName = `LazyOverlay(${name})`;
  const preload = () => {
    load().catch(() => {
      /* offline / deploy rollover — the real open will surface it */
    });
  };
  return Object.assign(LazyOverlay, { preload });
}

/**
 * Warms the given overlays' chunks once the screen is idle, so the first open
 * is instant. Total bytes are the same as before (they used to ship in the
 * page chunk) — they just no longer block the first render.
 */
export function useIdlePreload(
  overlays: ReadonlyArray<{ preload: () => void }>,
  delayMs = 2500,
): void {
  const listRef = useRef(overlays);
  useEffect(() => scheduleAfterSettle(() => listRef.current.forEach((o) => o.preload()), delayMs), [delayMs]);
}
