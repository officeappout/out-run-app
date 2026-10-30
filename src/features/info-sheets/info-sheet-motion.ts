/**
 * The "i" sheets' open / close motion (enable_feature_info_sheets_v1, board IOrigin): the sheet
 * grows out of the "i" as a clip-path circle and shrinks back into it. PURE: takes the button's
 * on-screen rect and the viewport, returns framer targets for the Sheet frame (`frameMotion`).
 *
 * The frame is `fixed inset-x-0 bottom-0`, so the circle's centre is written from the frame's
 * left and BOTTOM edges: the frame's height is unknown before it renders, its bottom is not.
 */

import type { SheetFrameMotion } from '@/components/ui/v2';

/** ~550ms on the iOS sheet curve (board IOrigin). */
export const INFO_SHEET_REVEAL_MS = 550;
export const INFO_SHEET_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
/** The circle the sheet starts from (the "i" itself). */
const START_RADIUS_PX = 12;
/** How long the "i" glows after the sheet closed back into it. */
export const INFO_GLOW_MS = 900;

export interface InfoOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InfoViewport {
  width: number;
  height: number;
}

const px = (n: number) => `${Math.round(n)}px`;

/** `circle(r at left X bottom Y)`; X / Y from the frame's left and bottom edges. */
export function clipCircle(radius: number, x: number, fromBottom: number): string {
  return `circle(${px(radius)} at left ${px(x)} bottom ${px(fromBottom)})`;
}

/**
 * The reveal for an "i" at `rect`. The end radius reaches the frame's farthest corner from the
 * centre (the frame is at most the viewport), so the open sheet is never clipped.
 */
export function infoSheetReveal(rect: InfoOriginRect, viewport: InfoViewport): SheetFrameMotion {
  const x = rect.left + rect.width / 2;
  const fromBottom = viewport.height - (rect.top + rect.height / 2);
  const far = Math.hypot(Math.max(x, viewport.width - x), Math.max(fromBottom, viewport.height));
  const from = clipCircle(START_RADIUS_PX, x, fromBottom);
  const to = clipCircle(Math.ceil(far) + 2, x, fromBottom);
  const transition = { duration: INFO_SHEET_REVEAL_MS / 1000, ease: INFO_SHEET_EASE };
  return { initial: { clipPath: from }, animate: { clipPath: to }, exit: { clipPath: from }, transition };
}
