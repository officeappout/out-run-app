/**
 * BackStack — global hardware-back handler registry (Native Phase, May 2026).
 *
 * A pure, framework-agnostic singleton that lets any component register a
 * priority back handler for the duration of its lifetime. The Android
 * hardware/gesture back button (wired in `src/lib/native/init.ts`) dispatches
 * through this stack BEFORE falling back to `window.history.back()`.
 *
 * Contract:
 *   • A handler returns `true` when it consumed the back event (e.g. it rolled
 *     an in-memory step back). Dispatch stops and the global listener returns
 *     without navigating browser history.
 *   • A handler returns `false` when it does not apply, letting the next
 *     handler down the stack — or the default `history.back()` — run.
 *
 * Handlers are evaluated top-down (most recently pushed first), mirroring the
 * way nested overlays/steps should intercept back before their parents.
 *
 * This module deliberately has NO React or Capacitor imports so it can be
 * imported from anywhere (native init, hooks, plain modules) without pulling
 * in extra bundles or breaking SSR.
 */

export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export const BackStack = {
  /** Register a handler. Most recently pushed handlers run first. */
  push: (fn: BackHandler) => {
    handlers.push(fn);
  },

  /** Remove a previously registered handler (matches the last occurrence). */
  pop: (fn: BackHandler) => {
    const idx = handlers.lastIndexOf(fn);
    if (idx !== -1) handlers.splice(idx, 1);
  },

  /**
   * Run the stack top-down. Returns `true` as soon as a handler consumes the
   * event, otherwise `false` so the caller can fall back to default behavior.
   */
  dispatch: (): boolean => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) return true;
    }
    return false;
  },
};
