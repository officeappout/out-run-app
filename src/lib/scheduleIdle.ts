/**
 * scheduleIdle — run `cb` when the main thread is idle, never blocking first paint / GPS init.
 *
 * Uses `requestIdleCallback` (with a `timeoutMs` ceiling so it can't starve forever on a busy map).
 * iOS WKWebView / Safari do not implement `requestIdleCallback`, so there it falls back to a plain
 * `setTimeout(fallbackDelayMs)` — a small deferral that lets the current render/paint finish first.
 * Returns a cancel function (safe to call after the callback has run).
 */
export interface ScheduleIdleOptions {
  /** requestIdleCallback ceiling — run no later than this even if the thread never idles. */
  timeoutMs?: number;
  /** Delay used when requestIdleCallback is unavailable (Safari / WKWebView / SSR-less tests). */
  fallbackDelayMs?: number;
}

export function scheduleIdle(cb: () => void, opts: ScheduleIdleOptions = {}): () => void {
  const { timeoutMs = 3000, fallbackDelayMs = 600 } = opts;
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => cb(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback?.(id);
  }
  const t = setTimeout(cb, fallbackDelayMs);
  return () => clearTimeout(t);
}
