/**
 * sheet-handle-tap — pure decisions for "tap the drawer handle / top edge to toggle" (Sderot pilot G2.5).
 *
 * The route-overview drawer (HybridOverviewScreen) has three detents: peek ⊂ half ⊂ full. Dragging
 * is unchanged; a TAP on the handle now toggles too:
 *   - docked (peek)   → open (half — the drawer's default detent)
 *   - open (half/full) → docked (peek)
 *
 * A tap must never be misread as a drag (and vice versa): a click is ignored when framer reported a
 * drag for this pointer, or when the pointer travelled more than TAP_SLOP_PX between down and click.
 * Keyboard activation (Enter / Space → click with no pointerdown) is always a tap.
 */

export type HandleDetent = 'peek' | 'half' | 'full';

/** Max pointer travel (px) between pointerdown and click that still counts as a tap. */
export const TAP_SLOP_PX = 10;

/** Detent a handle tap moves the drawer to. */
export function nextDetentOnHandleTap(current: string | null | undefined): HandleDetent {
  return current === 'peek' ? 'half' : 'peek';
}

/** aria-expanded for the handle button: anything above peek reads as expanded. */
export function isHandleExpanded(current: string | null | undefined): boolean {
  return current !== 'peek';
}

/**
 * Whether a click on the handle is a genuine tap (→ toggle) and not the tail of a drag.
 * @param dragged framer fired onDragStart since the last pointerdown on the handle.
 * @param down pointerdown position, or null when there was none (keyboard activation).
 * @param up the click's position.
 */
export function isHandleTap(
  dragged: boolean,
  down: { x: number; y: number } | null,
  up: { x: number; y: number },
): boolean {
  if (dragged) return false;
  if (!down) return true;
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX;
}
