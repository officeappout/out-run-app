/**
 * Entry drawer collapse (pilot note AD2, 29.10). Pure, unit-tested.
 *
 * The "גרים ב…?" drawer can be collapsed so the map shows: by a swipe on its
 * handle, a tap on the handle, or automatically when the user drags the map.
 * Collapsed, the primary CTA ("כן, זה הבית שלי") stays visible.
 */

/** A downward swipe longer than this (px) collapses; upward expands. */
export const COLLAPSE_DRAG_PX = 40;
/** ...or a flick faster than this (px/s), whatever the distance. */
export const COLLAPSE_FLICK_PX_S = 400;

/** The drawer's state after a swipe on its handle ends. */
export function collapsedAfterSwipe(collapsed: boolean, offsetY: number, velocityY: number): boolean {
  if (offsetY > COLLAPSE_DRAG_PX || velocityY > COLLAPSE_FLICK_PX_S) return true;
  if (offsetY < -COLLAPSE_DRAG_PX || velocityY < -COLLAPSE_FLICK_PX_S) return false;
  return collapsed;
}
