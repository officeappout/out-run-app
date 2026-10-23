/**
 * Pure logic behind useSheetScrollChain — no React, no DOM, unit-testable.
 */
import { shouldDismissSheet } from '@/components/ui/v2/logic';

/** A downward flick (px/s) that closes regardless of distance. Same as the Sheet default. */
export const CHAIN_FLICK_VELOCITY = 500;

/**
 * Where a chain gesture is measured from. While the scroller still has content
 * above the viewport (scrollTop > 0) the finger is scrolling, not pulling the
 * sheet — so the anchor follows the finger. The pull is then measured from the
 * moment the scroller reached the top; measuring from touchstart made a long
 * scroll-up that ends at the top teleport (and close) the sheet.
 */
export function nextChainAnchor(anchorY: number, clientY: number, scrollTop: number): number {
  return scrollTop > 0 ? clientY : anchorY;
}

/** Should this touchmove start/continue pulling the sheet? */
export function shouldChain(scrollTop: number, deltaY: number, alreadyChaining: boolean): boolean {
  return alreadyChaining || (scrollTop <= 0 && deltaY > 0);
}

/** Sheet translate for a pull of `deltaY` px with the given resistance (never negative). */
export function chainOffset(deltaY: number, resistance: number): number {
  const v = deltaY * resistance;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Release: close past `threshold` px of sheet travel, or on a fast downward flick. */
export function shouldCloseChain(offsetY: number, velocityY: number, threshold: number): boolean {
  return shouldDismissSheet(offsetY, velocityY, { distance: threshold, velocity: CHAIN_FLICK_VELOCITY });
}

/** Finger velocity (px/s, + = down) between two samples; 0 for a degenerate interval. */
export function fingerVelocity(prevY: number, prevT: number, y: number, t: number): number {
  const dt = t - prevT;
  if (!(dt > 0)) return 0;
  const v = ((y - prevY) / dt) * 1000;
  return Number.isFinite(v) ? v : 0;
}
