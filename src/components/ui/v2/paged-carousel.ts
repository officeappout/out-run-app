/**
 * PagedCarousel — pure helpers (no React), for tests.
 */

/**
 * The page a full-width snap rail rests on. `scrollLeft` is negative in an RTL
 * rail on modern engines (0 → −max), positive in LTR — the magnitude is what counts.
 */
export function pageFromScroll(scrollLeft: number, width: number, count: number): number {
  if (!(width > 0) || count <= 1 || !Number.isFinite(scrollLeft)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollLeft) / width)));
}
