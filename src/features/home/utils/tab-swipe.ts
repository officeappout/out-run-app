/**
 * Pilot AI1 (enable_pilot_ah_v1): home's "התקדמות שבועית / מדדי בריאות" tabs also switch by a
 * horizontal swipe on their area. PURE: the tab a finished swipe lands on, or null.
 *
 * Horizontal only (|dx| ≥ MIN_SWIPE_PX and clearly more than |dy|), so vertical scroll is never
 * taken. RTL: the next tab sits to the LEFT, so a swipe to the right (dx > 0) goes forward; LTR the
 * other way. No wrap-around at the ends.
 */
export const MIN_SWIPE_PX = 48;
const HORIZONTAL_RATIO = 1.5;

export function tabSwipeTarget<T>(tabs: readonly T[], active: T, dx: number, dy: number, isRtl: boolean): T | null {
  if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return null;
  const i = tabs.indexOf(active);
  if (i < 0) return null;
  const forward = isRtl ? dx > 0 : dx < 0;
  const next = i + (forward ? 1 : -1);
  return next >= 0 && next < tabs.length ? tabs[next] : null;
}
